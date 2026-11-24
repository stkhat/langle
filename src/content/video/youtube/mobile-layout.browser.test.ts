import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../../../../tests/fixtures/m-youtube-watch.html?raw";
import { enterFullscreen } from "../../../testing/fullscreen";
import type { PlatformAdapter } from "../platform";
import { createYouTubeAdapter } from "./adapter";
import { mobileLayout } from "./mobile-layout";

const VIDEO_ID = "iG9CE55wbtY";
const TITLE = "A lantern for the lighthouse | Sample Channel";

let root: HTMLElement;
let adapter: PlatformAdapter;
let href: string;

/** The measured m.youtube.com watch page (its body and its layout styles), on this page. */
function mountFixture(): HTMLElement {
  const parsed = new DOMParser().parseFromString(fixture, "text/html");
  const element = document.createElement("div");
  element.append(
    ...parsed.head.querySelectorAll("style"),
    ...parsed.body.childNodes,
  );
  document.body.append(element);
  return element;
}

const byId = (id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`No #${id}`);
  return element;
};

beforeEach(() => {
  href = `https://m.youtube.com/watch?v=${VIDEO_ID}`;
  root = mountFixture();
  adapter = createYouTubeAdapter({
    href: () => href,
    layout: mobileLayout(),
  });
});
afterEach(() => {
  adapter.dispose();
  root.remove();
});

describe("m.youtube.com's watch page", () => {
  it("finds the player and the box under it, with no controls, side column or Short", () => {
    expect(adapter.playerElement()).toBe(byId("movie_player"));
    expect(adapter.video()?.classList.contains("html5-main-video")).toBe(true);
    expect(adapter.controlsPoint()).toBeNull();
    const below = adapter.belowVideoElement();
    expect(below?.classList.contains("watch-below-the-player")).toBe(true);
    // Before YouTube's metadata, under the pinned player's placeholder.
    expect(
      below?.querySelector("ytm-slim-video-metadata-section-renderer"),
    ).not.toBeNull();
    expect(below?.previousElementSibling?.className).toContain(
      "player-placeholder",
    );
    expect(adapter.sideColumn()).toBeNull();
    expect(adapter.vertical?.()).toBe(false);
    expect(adapter.besidePlayer?.()).toBeNull();
  });

  it("reads the title from the metadata, else from the document's title", () => {
    expect(adapter.title()).toBe(TITLE);
    root.querySelector("ytm-slim-video-metadata-section-renderer")?.remove();
    const title = document.title;
    document.title = "Another talk - YouTube";
    try {
      expect(adapter.title()).toBe("Another talk");
    } finally {
      document.title = title;
    }
  });

  it("knows the video from the URL and gives the desktop URL as its source", () => {
    expect(adapter.videoId()).toBe(VIDEO_ID);
    expect(adapter.url()).toBe(`https://www.youtube.com/watch?v=${VIDEO_ID}`);
  });

  it("shows nothing on a Short", () => {
    href = `https://m.youtube.com/shorts/${VIDEO_ID}`;
    expect(adapter.videoId()).toBeUndefined();
    expect(adapter.vertical?.()).toBe(false);
  });

  it("hears an in-page navigation from state-navigateend, once", () => {
    const listener = vi.fn();
    const off = adapter.onNavigate(listener);
    document.dispatchEvent(new Event("yt-navigate-finish"));
    window.dispatchEvent(new Event("video-data-change"));
    expect(listener).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("state-navigateend"));
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    window.dispatchEvent(new Event("state-navigateend"));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("sees ads from the player's class", () => {
    expect(adapter.adShowing()).toBe(false);
    byId("movie_player").classList.add("ad-showing");
    expect(adapter.adShowing()).toBe(true);
  });

  it("hides the site's caption container", () => {
    const captions = byId("ytp-caption-window-container");
    adapter.hideSiteCaptions(true);
    expect(getComputedStyle(captions).display).toBe("none");
    adapter.hideSiteCaptions(false);
    expect(getComputedStyle(captions).display).not.toBe("none");
  });

  describe("in fullscreen", () => {
    it("fills the screen when YouTube puts the player's container in fullscreen", async () => {
      expect(adapter.fillsWindow?.()).toBe(false);
      await enterFullscreen(byId("player-container-id"));
      expect(adapter.fillsWindow?.()).toBe(true);
    });

    it("does not fill the screen with something else in fullscreen", async () => {
      await enterFullscreen(byId("movie_player"));
      expect(adapter.fillsWindow?.()).toBe(false);
    });

    it("narrows the player's box by its width and gives it back", async () => {
      await enterFullscreen(byId("player-container-id"));
      const box = byId("player");
      const full = box.getBoundingClientRect().width;
      adapter.narrowPlayer?.(332);
      expect(box.style.getPropertyValue("width")).toBe("calc(100% - 332px)");
      expect(box.getBoundingClientRect().width).toBeCloseTo(full - 332, 0);
      adapter.narrowPlayer?.(0);
      expect(box.style.getPropertyValue("width")).toBe("");
    });
  });
});
