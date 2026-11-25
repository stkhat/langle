import { afterEach, describe, expect, test, vi } from "vitest";
import type { send as Send } from "../messaging/client";
import { followVideoRecents, reportPageVisit, siteName } from "./recents";
import type { PlatformAdapter, VideoDetails } from "./video/platform";

const APP = { appHost: { openPage: () => Promise.resolve() } };
const NOT_APP = {};
const TICK_MS = 20;

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function fakeSend() {
  const sent: unknown[] = [];
  const send = vi.fn((request: unknown) => {
    sent.push(request);
    return Promise.resolve(null);
  }) as unknown as typeof Send;
  return { send, sent };
}

/** A video element whose time, length and playing state the test sets. */
function fakeVideo() {
  const video = document.createElement("video");
  document.body.append(video);
  cleanups.push(() => video.remove());
  const state = { currentTime: 0, duration: 570, paused: true };
  for (const key of ["currentTime", "duration", "paused"] as const)
    Object.defineProperty(video, key, { get: () => state[key] });
  return { video, state };
}

function fakeAdapter(video: HTMLVideoElement) {
  const page = {
    id: "abc" as string | undefined,
    ad: false,
    details: undefined as VideoDetails | undefined,
  };
  const navigate: (() => void)[] = [];
  const adapter = {
    videoId: () => page.id,
    title: () => "Heading on the page",
    url: () => `https://www.youtube.com/watch?v=${page.id}`,
    video: () => video,
    adShowing: () => page.ad,
    details: () => Promise.resolve(page.details),
    onNavigate(listener: () => void) {
      navigate.push(listener);
      return () => navigate.splice(navigate.indexOf(listener), 1);
    },
  } as unknown as PlatformAdapter;
  const go = (id: string) => {
    page.id = id;
    for (const listener of navigate) listener();
  };
  return { adapter, page, go, listeners: navigate };
}

function follow(adapter: PlatformAdapter, g: object, send: typeof Send) {
  const stop = followVideoRecents(adapter, { send, g, intervalMs: TICK_MS });
  cleanups.push(stop);
  return stop;
}

const visits = (sent: unknown[]) =>
  sent.filter((r) => (r as { type: string }).type === "recentsVisit");
const progresses = (sent: unknown[]) =>
  sent.filter((r) => (r as { type: string }).type === "recentsProgress");

describe("siteName", () => {
  test("is og:site_name, else the host without www. or m.", () => {
    const doc = document.implementation.createHTMLDocument("x");
    expect(siteName(doc, "https://www.example.com/a")).toBe("example.com");
    expect(siteName(doc, "https://m.example.com/a")).toBe("example.com");
    expect(siteName(doc, "https://news.example.com/a")).toBe(
      "news.example.com",
    );
    doc.head.innerHTML =
      '<meta property="og:site_name" content=" The Weekend Table ">';
    expect(siteName(doc, "https://www.example.com/a")).toBe(
      "The Weekend Table",
    );
  });
});

describe("reportPageVisit", () => {
  test("sends the page's address, title and site in the app", () => {
    const { send, sent } = fakeSend();
    reportPageVisit({ send, g: APP });
    expect(sent).toEqual([
      {
        type: "recentsVisit",
        page: {
          url: location.href,
          title: document.title.trim() || siteName(),
          site: siteName(),
          kind: "page",
        },
      },
    ]);
  });

  test("sends nothing without appHost", () => {
    const { send, sent } = fakeSend();
    reportPageVisit({ send, g: NOT_APP });
    expect(sent).toEqual([]);
  });
});

describe("followVideoRecents", () => {
  test("sends nothing without appHost: no visit, no position", async () => {
    const { send, sent } = fakeSend();
    const { video, state } = fakeVideo();
    const { adapter, go, listeners } = fakeAdapter(video);
    follow(adapter, NOT_APP, send);
    state.paused = false;
    go("def");
    video.dispatchEvent(new Event("pause"));
    window.dispatchEvent(new Event("pagehide"));
    await new Promise((resolve) => setTimeout(resolve, TICK_MS * 3));
    expect(sent).toEqual([]);
    expect(listeners).toEqual([]);
  });

  test("a visit per video shown, with the player's title when it holds that video", async () => {
    const { send, sent } = fakeSend();
    const { video } = fakeVideo();
    const { adapter, page, go } = fakeAdapter(video);
    page.details = { id: "abc", title: "Sourdough at home", channel: "Bakers" };
    follow(adapter, APP, send);
    await expect.poll(() => visits(sent)).toHaveLength(1);
    // The player still holds the last video right after navigation: the page's title.
    go("def");
    await expect.poll(() => visits(sent)).toHaveLength(2);
    expect(visits(sent)).toEqual([
      {
        type: "recentsVisit",
        page: {
          url: "https://www.youtube.com/watch?v=abc",
          title: "Sourdough at home",
          site: siteName(),
          kind: "video",
        },
      },
      {
        type: "recentsVisit",
        page: expect.objectContaining({
          url: "https://www.youtube.com/watch?v=def",
          title: "Heading on the page",
        }),
      },
    ]);
    // The same video again (another navigation event) is not another visit.
    go("def");
    await new Promise((resolve) => setTimeout(resolve, TICK_MS * 3));
    expect(visits(sent)).toHaveLength(2);
  });

  test("the position while playing, on pause and on leaving; not during an ad", async () => {
    const { send, sent } = fakeSend();
    const { video, state } = fakeVideo();
    const { adapter, page } = fakeAdapter(video);
    page.details = { id: "abc", title: "Sourdough at home", channel: "Bakers" };
    follow(adapter, APP, send);
    await expect.poll(() => visits(sent)).toHaveLength(1);

    // Paused: the timer sends nothing.
    await new Promise((resolve) => setTimeout(resolve, TICK_MS * 3));
    expect(progresses(sent)).toEqual([]);

    state.paused = false;
    state.currentTime = 252;
    await expect.poll(() => progresses(sent).length).toBeGreaterThan(0);
    expect(progresses(sent)[0]).toEqual({
      type: "recentsProgress",
      progress: {
        url: "https://www.youtube.com/watch?v=abc",
        position: 252,
        duration: 570,
        title: "Sourdough at home",
        channel: "Bakers",
      },
    });

    state.paused = true;
    await new Promise((resolve) => setTimeout(resolve, TICK_MS * 2));
    const before = progresses(sent).length;
    state.currentTime = 300;
    video.dispatchEvent(new Event("pause"));
    await expect.poll(() => progresses(sent)).toHaveLength(before + 1);
    window.dispatchEvent(new Event("pagehide"));
    await expect.poll(() => progresses(sent)).toHaveLength(before + 2);

    page.ad = true;
    video.dispatchEvent(new Event("pause"));
    window.dispatchEvent(new Event("pagehide"));
    await new Promise((resolve) => setTimeout(resolve, TICK_MS * 2));
    expect(progresses(sent)).toHaveLength(before + 2);
  });

  test("stops listening when stopped", async () => {
    const { send, sent } = fakeSend();
    const { video, state } = fakeVideo();
    const { adapter, go, listeners } = fakeAdapter(video);
    const stop = follow(adapter, APP, send);
    await expect.poll(() => visits(sent)).toHaveLength(1);
    stop();
    expect(listeners).toEqual([]);
    const count = sent.length;
    state.paused = false;
    go("def");
    video.dispatchEvent(new Event("pause"));
    window.dispatchEvent(new Event("pagehide"));
    await new Promise((resolve) => setTimeout(resolve, TICK_MS * 3));
    expect(sent).toHaveLength(count);
  });
});
