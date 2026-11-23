import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { agreed, chosen, SETUP_KEY } from "../core/setup";
import { runWhenSetUp } from "./setup";

let invalidate: () => void;
const ctx = {
  onInvalidated(callback: () => void) {
    const previous = invalidate;
    invalidate = () => {
      previous();
      callback();
    };
  },
};

beforeEach(() => {
  fakeBrowser.reset();
  invalidate = () => {};
});

const setUp = () =>
  browser.storage.local.set({ [SETUP_KEY]: chosen(agreed(undefined)) });
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

/** What the background's "does Langle run in this tab" gets. */
async function presence() {
  const reply = vi.fn();
  // The listeners answer through `reply`, before the trigger resolves.
  void (await fakeBrowser.runtime.onMessage.trigger(
    { type: "pagePresence" },
    {},
    reply,
  ));
  return reply.mock.calls[0]?.[0] as unknown;
}

describe("runWhenSetUp", () => {
  it("starts nothing until the setup ends, then starts", async () => {
    const start = vi.fn();
    const waiting = vi.fn();
    runWhenSetUp(ctx, start, { waiting });
    await vi.waitFor(() => expect(waiting).toHaveBeenCalledOnce());
    expect(start).not.toHaveBeenCalled();
    await setUp();
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
  });

  it("starts at once on a device that is set up", async () => {
    await setUp();
    const start = vi.fn();
    const waiting = vi.fn();
    runWhenSetUp(ctx, start, { waiting });
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
    expect(waiting).not.toHaveBeenCalled();
  });

  it("says it is there, also before consent, and needs no reload", async () => {
    runWhenSetUp(ctx, vi.fn());
    expect(await presence()).toEqual({ reload: false });
    await setUp();
    expect(await presence()).toEqual({ reload: false });
  });

  it("needs a reload where it needs the page's load and missed it", async () => {
    const start = vi.fn();
    runWhenSetUp(ctx, start, { needsPageLoad: true });
    await settle();
    await setUp();
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
    expect(await presence()).toEqual({ reload: true });
  });

  it("needs none where it ran from the page's load", async () => {
    await setUp();
    const start = vi.fn();
    runWhenSetUp(ctx, start, { needsPageLoad: true });
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
    expect(await presence()).toEqual({ reload: false });
  });

  it("neither answers nor starts once it left the page", async () => {
    const start = vi.fn();
    runWhenSetUp(ctx, start);
    // Another listener, as the fake refuses to trigger none.
    browser.runtime.onMessage.addListener(() => undefined);
    invalidate();
    expect(await presence()).toBeUndefined();
    await setUp();
    await settle();
    expect(start).not.toHaveBeenCalled();
  });

  it("logs a start that failed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await setUp();
    runWhenSetUp(ctx, async () => {
      throw new Error("no page");
    });
    await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
    error.mockRestore();
  });
});
