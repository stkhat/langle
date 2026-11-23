import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { agreed, chosen, SETUP_KEY } from "../core/setup";
import { getSetupStage, watchSetupStage, whenSetUp } from "./setup";

beforeEach(() => fakeBrowser.reset());

const AGREED = agreed(undefined);
const READY = chosen(AGREED);
const store = (value: unknown) =>
  browser.storage.local.set({ [SETUP_KEY]: value });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("getSetupStage", () => {
  it("reads this device's setup", async () => {
    expect(await getSetupStage()).toBe("consent");
    await store(READY);
    expect(await getSetupStage()).toBe("ready");
  });

  it("never takes what browser sync brought for consent", async () => {
    await browser.storage.sync.set({ [SETUP_KEY]: READY });
    expect(await getSetupStage()).toBe("consent");
  });
});

describe("watchSetupStage", () => {
  it("hears each change of the stage until unwatched", async () => {
    const heard = vi.fn();
    const unwatch = watchSetupStage(heard);
    await store(AGREED);
    await store(READY);
    unwatch();
    await browser.storage.local.remove(SETUP_KEY);
    expect(heard.mock.calls).toEqual([["languages"], ["ready"]]);
  });
});

describe("whenSetUp", () => {
  it("calls at once on a device that is set up", async () => {
    await store(READY);
    const run = vi.fn();
    whenSetUp(run);
    await tick();
    expect(run).toHaveBeenCalledOnce();
  });

  it("waits through consent for the languages", async () => {
    const run = vi.fn();
    whenSetUp(run);
    await tick();
    await store(AGREED);
    await tick();
    expect(run).not.toHaveBeenCalled();
    await store(READY);
    await tick();
    expect(run).toHaveBeenCalledOnce();
  });

  it("calls once when the setup ends while it is being read", async () => {
    const run = vi.fn();
    whenSetUp(run);
    await store(READY);
    await store({ ...READY });
    await tick();
    expect(run).toHaveBeenCalledOnce();
  });

  it("says that it is waiting, only where it has to wait", async () => {
    const waiting = vi.fn();
    whenSetUp(() => {}, waiting);
    await tick();
    expect(waiting).toHaveBeenCalledOnce();
    await store(READY);
    const none = vi.fn();
    whenSetUp(() => {}, none);
    await tick();
    expect(none).not.toHaveBeenCalled();
  });

  it("never calls once cancelled", async () => {
    const run = vi.fn();
    whenSetUp(run)();
    await store(READY);
    await tick();
    expect(run).not.toHaveBeenCalled();
  });

  it("does not run when the setup cannot be read", async () => {
    vi.spyOn(browser.storage.local, "get").mockRejectedValueOnce(
      new Error("gone"),
    );
    const run = vi.fn();
    whenSetUp(run);
    await tick();
    expect(run).not.toHaveBeenCalled();
  });
});
