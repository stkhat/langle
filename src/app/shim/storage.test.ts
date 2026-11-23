import { describe, expect, test, vi } from "vitest";
import { fakeBridge } from "../testing/fake-bridge";
import { createStorage } from "./storage";

const STORED = { settings: { on: true }, packState: {} };

function storageOver(stored: Record<string, unknown> = STORED) {
  const native = fakeBridge((api, [keys]) =>
    !api.endsWith(".get")
      ? undefined
      : keys === null
        ? stored
        : Object.fromEntries(
            (keys as string[])
              .filter((key) => key in stored)
              .map((key) => [key, stored[key]]),
          ),
  );
  return { ...native, storage: createStorage(native.bridge) };
}

describe("storage areas", () => {
  test("get(key) asks for that key", async () => {
    const { storage, calls } = storageOver();
    await expect(storage.local.get("settings")).resolves.toEqual({
      settings: { on: true },
    });
    expect(calls).toEqual([{ api: "storage.local.get", args: [["settings"]] }]);
  });

  test("get(keys) returns only the keys that are stored", async () => {
    const { storage } = storageOver();
    await expect(storage.sync.get(["settings", "missing"])).resolves.toEqual({
      settings: { on: true },
    });
  });

  test("get() and get(null) return everything", async () => {
    const { storage, calls } = storageOver();
    await expect(storage.local.get()).resolves.toEqual(STORED);
    await expect(storage.local.get(null)).resolves.toEqual(STORED);
    expect(calls.map(({ args }) => args)).toEqual([[null], [null]]);
  });

  test("get(defaults) fills in the keys that are missing", async () => {
    const { storage, calls } = storageOver();
    await expect(
      storage.session.get({ settings: "default", setupTab: 7 }),
    ).resolves.toEqual({ settings: { on: true }, setupTab: 7 });
    expect(calls).toEqual([
      { api: "storage.session.get", args: [["settings", "setupTab"]] },
    ]);
  });

  test("set, remove and clear call their area's api", async () => {
    const { storage, calls } = storageOver();
    await storage.sync.set({ settings: 1 });
    await storage.local.remove("settings");
    await storage.local.remove(["a", "b"]);
    await storage.session.clear();
    expect(calls).toEqual([
      { api: "storage.sync.set", args: [{ settings: 1 }] },
      { api: "storage.local.remove", args: [["settings"]] },
      { api: "storage.local.remove", args: [["a", "b"]] },
      { api: "storage.session.clear", args: [] },
    ]);
  });

  test("set resolves with nothing", async () => {
    const native = fakeBridge(() => "something");
    await expect(
      createStorage(native.bridge).local.set({ a: 1 }),
    ).resolves.toBeUndefined();
  });
});

describe("storage.onChanged", () => {
  test("gets the changes and the area's name", async () => {
    const { storage, emit } = storageOver();
    const listener = vi.fn();
    storage.onChanged.addListener(listener);
    await emit("storage.onChanged", { settings: { newValue: 1 } }, "sync");
    expect(listener).toHaveBeenCalledWith(
      { settings: { newValue: 1 } },
      "sync",
    );
  });

  test("each area's onChanged hears only its own changes", async () => {
    const { storage, emit } = storageOver();
    const local = vi.fn();
    const sync = vi.fn();
    storage.local.onChanged.addListener(local);
    storage.sync.onChanged.addListener(sync);
    await emit("storage.onChanged", { a: { newValue: 1 } }, "local");
    expect(local).toHaveBeenCalledWith({ a: { newValue: 1 } });
    expect(sync).not.toHaveBeenCalled();
  });
});
