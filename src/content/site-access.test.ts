import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import type { SiteAccessRemoved } from "../messaging/site-access";
import { leaveWhenAccessRemoved, losesAccess } from "./site-access";

const removed = (
  removedOrigins: string[],
  granted: string[] = [],
): SiteAccessRemoved => ({
  type: "siteAccessRemoved",
  removed: removedOrigins,
  granted,
});

describe("losesAccess", () => {
  const page = new URL("https://a.example/story");

  it("is true when a removed grant covered the page and none left does", () => {
    expect(losesAccess(removed(["*://a.example/*"]), page)).toBe(true);
    expect(losesAccess(removed(["*://*/*"], ["*://b.example/*"]), page)).toBe(
      true,
    );
  });

  it("is false for another host's grant, or when another grant still covers the page", () => {
    expect(losesAccess(removed(["*://b.example/*"]), page)).toBe(false);
    expect(losesAccess(removed(["*://*/*"], ["*://a.example/*"]), page)).toBe(
      false,
    );
    expect(losesAccess(removed(["*://a.example/*"], ["*://*/*"]), page)).toBe(
      false,
    );
  });
});

describe("leaveWhenAccessRemoved", () => {
  beforeEach(() => fakeBrowser.reset());

  function context() {
    const controller = new AbortController();
    return {
      ctx: {
        abort: (reason?: unknown) => controller.abort(reason),
        onInvalidated: (callback: () => void) =>
          controller.signal.addEventListener("abort", callback),
      },
      aborted: () => controller.signal.aborted,
    };
  }
  const page = () => new URL("https://a.example/story");

  it("invalidates the context when the page loses its access", async () => {
    const { ctx, aborted } = context();
    leaveWhenAccessRemoved(ctx, page);
    const send = async (message: unknown) => {
      void (await fakeBrowser.runtime.onMessage.trigger(message, {}, () => {}));
    };
    await send(removed(["*://b.example/*"]));
    await send({ type: "pageSummary" });
    expect(aborted()).toBe(false);
    await send(removed(["*://a.example/*"]));
    expect(aborted()).toBe(true);
  });

  it("stops listening once the context is invalidated", async () => {
    const { ctx } = context();
    leaveWhenAccessRemoved(ctx, page);
    ctx.abort();
    expect(fakeBrowser.runtime.onMessage.hasListeners()).toBe(false);
  });
});
