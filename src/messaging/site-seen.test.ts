import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
  addSiteSeen,
  getSiteSeen,
  SITE_SEEN_KEY,
  watchSiteSeen,
} from "./site-seen";

beforeEach(() => {
  fakeBrowser.reset();
});

describe("seen hosts", () => {
  it("are none at first, then each host added once, lowercased, in order", async () => {
    expect(await getSiteSeen()).toEqual([]);
    await addSiteSeen("b.example");
    await addSiteSeen("A.example");
    await addSiteSeen("b.example");
    expect(await getSiteSeen()).toEqual(["b.example", "a.example"]);
    expect(
      (await browser.storage.local.get(SITE_SEEN_KEY))[SITE_SEEN_KEY],
    ).toEqual(["b.example", "a.example"]);
  });

  it("count what is not a list of hosts as none, and skip what is not a host", async () => {
    await browser.storage.local.set({ [SITE_SEEN_KEY]: "broken" });
    expect(await getSiteSeen()).toEqual([]);
    await browser.storage.local.set({ [SITE_SEEN_KEY]: ["a.example", 3] });
    expect(await getSiteSeen()).toEqual(["a.example"]);
  });

  it("are watched in storage.local until unwatched", async () => {
    const seen = vi.fn();
    const unwatch = watchSiteSeen(seen);
    await addSiteSeen("a.example");
    await vi.waitFor(() => expect(seen).toHaveBeenCalledWith(["a.example"]));
    await browser.storage.sync.set({ [SITE_SEEN_KEY]: ["sync.example"] });
    await browser.storage.local.set({ other: 1 });
    unwatch();
    await addSiteSeen("b.example");
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
