import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fakeBridge } from "../testing/fake-bridge";
import { installShim } from "./install";

const INFO = {
  id: "langle-app",
  origin: "https://app.langle.invalid",
  manifest: { manifest_version: 3, name: "Langle", version: "0.1.0" },
};

type Globals = { browser?: unknown; chrome?: unknown };
const globals = globalThis as Globals;
let saved: Globals;
beforeEach(() => {
  saved = { browser: globals.browser, chrome: globals.chrome };
});
afterEach(() => {
  globals.browser = saved.browser;
  globals.chrome = saved.chrome;
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
