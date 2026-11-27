import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fakeBridge } from "../testing/fake-bridge";
import { appHostOf } from "../../core/app-host";
import { installShim } from "./install";

const INFO = {
  id: "langle-app",
  origin: "https://app.langle.invalid",
  manifest: { manifest_version: 3, name: "Langle", version: "0.1.0" },
};

type Globals = { browser?: unknown; chrome?: unknown; appHost?: unknown };
const globals = globalThis as Globals;
let saved: Globals;
beforeEach(() => {
  saved = {
    browser: globals.browser,
    chrome: globals.chrome,
    appHost: globals.appHost,
  };
});
afterEach(() => {
  globals.browser = saved.browser;
  globals.chrome = saved.chrome;
  globals.appHost = saved.appHost;
});

describe("installShim", () => {
  test("sets browser and chrome to the shim, with a runtime id for wxt/browser", () => {
    const shim = installShim(fakeBridge().bridge, INFO);
    expect(globals.browser).toBe(shim);
    expect(globals.chrome).toBe(shim);
    expect(shim.runtime.id).toBe("langle-app");
  });

  test("tabs calls pass Chrome's arguments to native code and return its answer", async () => {
    const native = fakeBridge((api) =>
      api === "tabs.query" ? [{ id: 3, active: true }] : undefined,
    );
    const { tabs } = installShim(native.bridge, INFO);
    await expect(tabs.query({ active: true })).resolves.toEqual([
      { id: 3, active: true },
    ]);
    await tabs.get(3);
    await tabs.create({ url: "https://app.langle.invalid/welcome.html" });
    await tabs.update(3, { active: true });
    await tabs.remove(3);
    await tabs.reload(3);
    await tabs.sendMessage(3, { type: "refresh" });
    expect(native.calls).toEqual([
      { api: "tabs.query", args: [{ active: true }] },
      { api: "tabs.get", args: [3] },
      {
        api: "tabs.create",
        args: [{ url: "https://app.langle.invalid/welcome.html" }],
      },
      { api: "tabs.update", args: [3, { active: true }] },
      { api: "tabs.remove", args: [3] },
      { api: "tabs.reload", args: [3] },
      { api: "tabs.sendMessage", args: [3, { type: "refresh" }] },
    ]);
  });

  test("alarms are calls, and onAlarm hears native timers", async () => {
    const native = fakeBridge((api) =>
      api === "alarms.get" ? { name: "packs", scheduledTime: 5 } : true,
    );
    const { alarms } = installShim(native.bridge, INFO);
    const fired = vi.fn();
    alarms.onAlarm.addListener(fired);
    await alarms.create("packs", { delayInMinutes: 1 });
    await expect(alarms.get("packs")).resolves.toEqual({
      name: "packs",
      scheduledTime: 5,
    });
    await expect(alarms.clear("packs")).resolves.toBe(true);
    await native.emit("alarms.onAlarm", { name: "packs", scheduledTime: 5 });
    expect(native.calls).toEqual([
      { api: "alarms.create", args: ["packs", { delayInMinutes: 1 }] },
      { api: "alarms.get", args: ["packs"] },
      { api: "alarms.clear", args: ["packs"] },
    ]);
    expect(fired).toHaveBeenCalledWith({ name: "packs", scheduledTime: 5 });
  });

  test("windows.update and action.setIcon do nothing; openPopup is a call", async () => {
    const native = fakeBridge();
    const { windows, action } = installShim(native.bridge, INFO);
    await expect(windows.update(1, { focused: true })).resolves.toBeUndefined();
    await expect(
      action.setIcon({ path: "icon-off/16.png" }),
    ).resolves.toBeUndefined();
    await action.openPopup();
    expect(native.calls).toEqual([{ api: "action.openPopup", args: [] }]);
  });

  test("i18n.getUILanguage is the web view's language (the first run reads it)", () => {
    const { i18n } = installShim(fakeBridge().bridge, INFO);
    expect(i18n.getUILanguage()).toBe(navigator.language);
  });

  test("i18n.detectLanguage is always unsure (the web views have no detector)", async () => {
    const { i18n } = installShim(fakeBridge().bridge, INFO);
    await expect(i18n.detectLanguage()).resolves.toEqual({
      isReliable: false,
      languages: [],
    });
  });

  test("sets appHost, whose openPage is a call native code answers", async () => {
    const native = fakeBridge();
    installShim(native.bridge, INFO);
    const appHost = appHostOf();
    expect(appHost).toBeDefined();
    await appHost?.openPage("https://example.com/");
    expect(native.calls).toEqual([
      { api: "appHost.openPage", args: ["https://example.com/"] },
    ]);
  });

  test("appHost.shareFile is a call with the file's name, type and text", async () => {
    const native = fakeBridge();
    installShim(native.bridge, INFO);
    const file = { name: "langle.csv", mime: "text/csv", text: "a,b" };
    await appHostOf()?.shareFile(file);
    expect(native.calls).toEqual([{ api: "appHost.shareFile", args: [file] }]);
  });

  test("appHost's translation calls pass their request to native code and read its answer", async () => {
    const native = fakeBridge((api) =>
      api === "appHost.translate"
        ? "猫。"
        : api === "appHost.translatorStatus"
          ? "packs"
          : api === "appHost.prepareTranslator"
            ? "something else"
            : undefined,
    );
    installShim(native.bridge, INFO);
    const app = appHostOf()!;
    const pair = { from: "en", to: "ja" };
    const request = { ...pair, text: "A cat.", start: false };
    await expect(app.translate(request)).resolves.toBe("猫。");
    await expect(app.translatorStatus(pair)).resolves.toBe("packs");
    // Anything but a known status is no translator.
    await expect(app.prepareTranslator(pair)).resolves.toBe("unavailable");
    const model = {
      pack: "mt-en-ja",
      version: "2026.1126.0",
      files: [{ path: "model.bin", sha256: "ab", size: 2 }],
      mirrors: ["https://cdn.test/{file}"],
    };
    await app.models.ensure(model);
    await app.models.remove("mt-en-ja");
    expect(native.calls).toEqual([
      { api: "appHost.translate", args: [request] },
      { api: "appHost.translatorStatus", args: [pair] },
      { api: "appHost.prepareTranslator", args: [pair] },
      { api: "appHost.models.ensure", args: [model] },
      { api: "appHost.models.remove", args: [{ pack: "mt-en-ja" }] },
    ]);
  });

  test("appHost.translate gives null for anything but a text", async () => {
    installShim(fakeBridge(() => undefined).bridge, INFO);
    await expect(
      appHostOf()!.translate({
        from: "en",
        to: "ja",
        text: "A cat.",
        start: true,
      }),
    ).resolves.toBeNull();
  });

  test("appHost.models.onProgress hears native code's progress events until unsubscribed", async () => {
    const native = fakeBridge();
    installShim(native.bridge, INFO);
    const heard: unknown[] = [];
    const stop = appHostOf()!.models.onProgress((p) => heard.push(p));
    const progress = { pack: "mt-en-ja", received: 5, total: 10 };
    await native.emit("appHost.models.onProgress", progress);
    stop();
    await native.emit("appHost.models.onProgress", progress);
    expect(heard).toEqual([progress]);
  });

  test("appHost.googleAuth is there only when the app said it can sign in", () => {
    installShim(fakeBridge().bridge, INFO);
    expect(appHostOf()!.googleAuth).toBeUndefined();
    installShim(fakeBridge().bridge, { ...INFO, googleAuth: true });
    expect(appHostOf()!.googleAuth).toBeDefined();
  });

  test("appHost.googleAuth's calls pass the request and read native code's answer", async () => {
    const answers: unknown[] = [
      { token: "ya29.a", expiresAt: 1_764_240_000_000 },
      { error: "cancelled" },
      { error: "retry" },
      { error: "something else" },
      { token: "", expiresAt: 1 },
      undefined,
    ];
    const native = fakeBridge((api) =>
      api === "appHost.googleAuth.token" ? answers.shift() : undefined,
    );
    installShim(native.bridge, { ...INFO, googleAuth: true });
    const auth = appHostOf()!.googleAuth!;
    await expect(auth.token({ interactive: true })).resolves.toEqual({
      token: "ya29.a",
      expiresAt: 1_764_240_000_000,
    });
    await expect(
      auth.token({ interactive: false, refused: "ya29.a" }),
    ).resolves.toEqual({ error: "cancelled" });
    await expect(auth.token({ interactive: false })).resolves.toEqual({
      error: "retry",
    });
    // Anything else is no token.
    for (let i = 0; i < 3; i++)
      await expect(auth.token({ interactive: false })).resolves.toEqual({
        error: "unauthorized",
      });
    await auth.forget();
    expect(native.calls).toEqual([
      { api: "appHost.googleAuth.token", args: [{ interactive: true }] },
      {
        api: "appHost.googleAuth.token",
        args: [{ interactive: false, refused: "ya29.a" }],
      },
      ...Array.from({ length: 4 }, () => ({
        api: "appHost.googleAuth.token",
        args: [{ interactive: false }],
      })),
      { api: "appHost.googleAuth.forget", args: [] },
    ]);
  });

  test("app.hidden is answered once every listener is done; app.visible reaches its listeners", async () => {
    const native = fakeBridge();
    installShim(native.bridge, INFO);
    const app = appHostOf()!;
    const heard: string[] = [];
    let finish = () => {};
    const stopHidden = app.onHidden(
      () =>
        new Promise<void>((resolve) => {
          heard.push("hidden");
          finish = () => {
            heard.push("written");
            resolve();
          };
        }),
    );
    const stopVisible = app.onVisible(() => heard.push("visible"));
    const answered = native.emit("app.hidden").then(() => heard.push("answer"));
    await Promise.resolve();
    expect(heard).toEqual(["hidden"]);
    finish();
    await answered;
    await native.emit("app.visible");
    stopHidden();
    stopVisible();
    await native.emit("app.hidden");
    await native.emit("app.visible");
    expect(heard).toEqual(["hidden", "written", "answer", "visible"]);
  });

  test("appHost.translator is what the app said, and missing when it said nothing", () => {
    installShim(fakeBridge().bridge, INFO);
    expect(appHostOf()!.translator).toBeUndefined();
    installShim(fakeBridge().bridge, {
      ...INFO,
      translator: { models: "packs" },
    });
    expect(appHostOf()!.translator).toEqual({ models: "packs" });
  });

  test("leaves out what the app does not have", () => {
    const shim = installShim(fakeBridge().bridge, INFO) as Record<
      string,
      unknown
    >;
    expect(shim.identity).toBeUndefined();
    expect(shim.offscreen).toBeUndefined();
    expect(shim.downloads).toBeUndefined();
  });
});
