import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPageBridge,
  installPageScript,
  tellPage,
  type PageGate,
} from "./page-channel";

/**
 * Disposing the bridge (Langle leaves the page, as after an extension reload) ends the
 * calls still waiting as aborted: the session ignores aborts instead of reporting them.
 */
describe("disposing a page bridge", () => {
  it("ends a waiting call as an abort", async () => {
    const bridge = createPageBridge<{ type: "ping" }, { ping: null }, string>({
      channel: { fromPage: "test", toPage: "test-request" },
      isEvent: (data): data is string => typeof data === "string",
      timeoutMs: 60_000,
    });
    const call = bridge.call({ type: "ping" });
    bridge.dispose();
    await expect(call).rejects.toMatchObject({ name: "AbortError" });
    await expect(call).rejects.toBeInstanceOf(DOMException);
  });
});

/**
 * The page's hooks run at document_start, before the content script knows whether the
 * user agreed (ui.md "First-run consent").
 */
describe("the page script's gate", () => {
  const channel = { fromPage: "gate-test", toPage: "gate-test-request" };
  const delivered = () => new Promise((resolve) => setTimeout(resolve, 50));
  let gate: PageGate;
  let uninstall: () => void;
  beforeEach(() => {
    uninstall = installPageScript(
      channel,
      () => false,
      (given) => {
        gate = given;
        return { answer: async () => null, uninstall() {} };
      },
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    uninstall();
  });

  it("holds what is seen until Langle says it is on, then takes it in order", async () => {
    const taken: number[] = [];
    gate.whenOn(() => taken.push(1));
    gate.whenOn(() => taken.push(2));
    await delivered();
    expect(taken).toEqual([]);
    tellPage(channel, "on");
    await expect.poll(() => taken).toEqual([1, 2]);
    gate.whenOn(() => taken.push(3));
    expect(taken).toEqual([1, 2, 3]);
  });

  it("drops it, and looks at nothing more, while the setup is waited for", async () => {
    const taken: number[] = [];
    gate.whenOn(() => taken.push(1));
    tellPage(channel, "wait");
    await expect.poll(() => gate.off).toBe(true);
    gate.whenOn(() => taken.push(2));
    tellPage(channel, "on");
    await expect.poll(() => gate.off).toBe(false);
    gate.whenOn(() => taken.push(3));
    expect(taken).toEqual([3]);
  });

  it("drops it when no word comes", async () => {
    uninstall();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    uninstall = installPageScript(
      channel,
      () => false,
      (given) => {
        gate = given;
        return { answer: async () => null, uninstall() {} };
      },
    );
    const take = vi.fn();
    gate.whenOn(take);
    vi.advanceTimersByTime(4999);
    expect(gate.off).toBe(false);
    vi.advanceTimersByTime(1);
    expect(gate.off).toBe(true);
    vi.useRealTimers();
    tellPage(channel, "on");
    await delivered();
    expect(take).not.toHaveBeenCalled();
  });

  it("keeps on once on", async () => {
    tellPage(channel, "on");
    tellPage(channel, "wait");
    await delivered();
    const take = vi.fn();
    gate.whenOn(take);
    expect(take).toHaveBeenCalledOnce();
  });

  it("is on once the content script's bridge exists", async () => {
    const take = vi.fn();
    gate.whenOn(take);
    const bridge = createPageBridge<{ type: "ping" }, { ping: null }, string>({
      channel,
      isEvent: (data): data is string => typeof data === "string",
    });
    await expect.poll(() => take.mock.calls.length).toBe(1);
    bridge.dispose();
  });
});
