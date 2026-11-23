import { describe, expect, test, vi } from "vitest";
import { NO_RECEIVER } from "../bridge/bridge";
import { fakeBridge } from "../testing/fake-bridge";
import { createRuntime } from "./runtime";

const INFO = {
  id: "langle-app",
  origin: "https://app.langle.invalid",
  manifest: { manifest_version: 3, name: "Langle", version: "0.1.0" },
};

const SENDER = { tab: { id: 3, url: "https://example.com/" }, frameId: 0 };

function runtimeOver(answer?: Parameters<typeof fakeBridge>[0]) {
  const native = fakeBridge(answer);
  return { ...native, runtime: createRuntime(native.bridge, INFO) };
}

describe("runtime", () => {
  test("has the app's id, URLs and manifest", () => {
    const { runtime } = runtimeOver();
    expect(runtime.id).toBe("langle-app");
    expect(runtime.getURL("/welcome.html")).toBe(
      "https://app.langle.invalid/welcome.html",
    );
    expect(runtime.getURL("icon/16.png")).toBe(
      "https://app.langle.invalid/icon/16.png",
    );
    expect(runtime.getManifest()).toEqual(INFO.manifest);
  });

  test("keeps one slash between an origin given with one and the path", () => {
    const native = fakeBridge();
    const runtime = createRuntime(native.bridge, {
      ...INFO,
      origin: "langle-app://app/",
    });
    expect(runtime.getURL("/welcome.html")).toBe(
      "langle-app://app/welcome.html",
    );
  });

  test("sendMessage resolves with the answer", async () => {
    const { runtime, calls } = runtimeOver(() => ({ count: 2 }));
    await expect(runtime.sendMessage({ type: "counts" })).resolves.toEqual({
      count: 2,
    });
    expect(calls).toEqual([
      { api: "runtime.sendMessage", args: [{ type: "counts" }] },
    ]);
  });

  test("sendMessage rejects with Chrome's text when nobody receives it", async () => {
    const { runtime } = runtimeOver(() => {
      throw new Error(NO_RECEIVER);
    });
    await expect(runtime.sendMessage({ type: "counts" })).rejects.toThrow(
      /Receiving end does not exist/,
    );
  });

  test("openOptionsPage and reload are calls", async () => {
    const { runtime, calls } = runtimeOver();
    await runtime.openOptionsPage();
    runtime.reload();
    expect(calls.map(({ api }) => api)).toEqual([
      "runtime.openOptionsPage",
      "runtime.reload",
    ]);
  });

  test("onInstalled and onStartup hear their events", async () => {
    const { runtime, emit } = runtimeOver();
    const installed = vi.fn();
    const startup = vi.fn();
    runtime.onInstalled.addListener(installed);
    runtime.onStartup.addListener(startup);
    await emit("runtime.onInstalled", { reason: "install" });
    await emit("runtime.onStartup");
    expect(installed).toHaveBeenCalledWith({ reason: "install" });
    expect(startup).toHaveBeenCalledOnce();
  });
});

describe("runtime.onMessage", () => {
  test("gives every listener the message, the sender and sendResponse", async () => {
    const { runtime, emit } = runtimeOver();
    const first = vi.fn();
    const second = vi.fn((_m, _s, sendResponse: (value: unknown) => void) =>
      sendResponse("ok"),
    );
    runtime.onMessage.addListener(first);
    runtime.onMessage.addListener(second);
    await expect(
      emit("runtime.onMessage", { type: "counts" }, SENDER),
    ).resolves.toBe("ok");
    expect(first).toHaveBeenCalledWith(
      { type: "counts" },
      SENDER,
      expect.any(Function),
    );
  });

  test("answers with the first sendResponse only", async () => {
    const { runtime, emit } = runtimeOver();
    runtime.onMessage.addListener((_m, _s, sendResponse) => {
      sendResponse("first");
      sendResponse("again");
    });
    runtime.onMessage.addListener((_m, _s, sendResponse) =>
      sendResponse("second"),
    );
    await expect(emit("runtime.onMessage", {}, SENDER)).resolves.toBe("first");
  });

  test("waits for a sendResponse after a listener returns true", async () => {
    const { runtime, emit } = runtimeOver();
    runtime.onMessage.addListener((_m, _s, sendResponse) => {
      setTimeout(() => sendResponse("later"), 0);
      return true;
    });
    await expect(emit("runtime.onMessage", {}, SENDER)).resolves.toBe("later");
  });

  test("answers with what a returned Promise resolves to", async () => {
    const { runtime, emit } = runtimeOver();
    runtime.onMessage.addListener(() => undefined);
    runtime.onMessage.addListener(() => Promise.resolve("promised"));
    await expect(emit("runtime.onMessage", {}, SENDER)).resolves.toBe(
      "promised",
    );
  });

  test("answers with the error of a rejected Promise", async () => {
    const { runtime, emit } = runtimeOver();
    runtime.onMessage.addListener(() => Promise.reject(new Error("failed")));
    await expect(emit("runtime.onMessage", {}, SENDER)).rejects.toThrow(
      "failed",
    );
  });

  test("gives Chrome's missing receiver error when no listener answers", async () => {
    const { runtime, emit } = runtimeOver();
    await expect(emit("runtime.onMessage", {}, SENDER)).rejects.toThrow(
      NO_RECEIVER,
    );
    runtime.onMessage.addListener(() => undefined);
    await expect(emit("runtime.onMessage", {}, SENDER)).rejects.toThrow(
      NO_RECEIVER,
    );
  });
});
