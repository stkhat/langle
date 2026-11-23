import { afterEach, describe, expect, test, vi } from "vitest";
import { startShim } from "./start-shim";

const INFO = {
  origin: "https://app.langle.invalid",
  manifest: { manifest_version: 3, name: "Langle", version: "0.1.0" },
  context: "content",
};

type Globals = {
  browser?: { runtime?: { id?: string; getURL(path: string): string } };
  chrome?: unknown;
};
const globals = globalThis as Globals;
const saved = { browser: globals.browser, chrome: globals.chrome };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  globals.browser = saved.browser;
  globals.chrome = saved.chrome;
});

describe("startShim", () => {
  test("installs the shim from the app's info at once, then says hello", async () => {
    const posted: { api?: string; args?: unknown[] }[] = [];
    vi.stubGlobal("langleBridge", {
      postMessage: (json: string) => posted.push(JSON.parse(json)),
    });
    vi.stubGlobal("__langleAppInfo", INFO);
    startShim();
    expect(globals.browser?.runtime?.id).toBe("langle-app");
    expect(globals.browser?.runtime?.getURL("/welcome.html")).toBe(
      "https://app.langle.invalid/welcome.html",
    );
    // After the context's other scripts have run (here: the next task).
    expect(posted).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(posted).toEqual([
      expect.objectContaining({
        kind: "call",
        api: "bridge.hello",
        args: [{ context: "content" }],
      }),
    ]);
  });

  test("does nothing but report outside the app", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    globals.browser = undefined;
    startShim();
    expect(globals.browser).toBeUndefined();
    expect(error).toHaveBeenCalledOnce();
  });
});
