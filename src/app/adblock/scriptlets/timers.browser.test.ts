// The scriptlets on timers, each in a window of its own.
import { describe, expect, it } from "vitest";
import { freshWindow } from "../../../testing/scriptlets";
import type { Win } from "./lib/shared";
import adjustSetInterval from "./adjust-setInterval";
import adjustSetTimeout from "./adjust-setTimeout";
import preventSetTimeout from "./prevent-setTimeout";

/** The delays `method` was called with, through a stand-in for the native one. */
function recordDelays(win: Win, method: "setTimeout" | "setInterval") {
  const delays: number[] = [];
  const callbacks: unknown[] = [];
  win[method] = ((callback: unknown, delay: number) => {
    callbacks.push(callback);
    delays.push(delay);
    return 1;
  }) as Win["setTimeout"];
  return { delays, callbacks };
}

describe("prevent-setTimeout", () => {
  const ad = () => "showAd";
  const other = () => "other";

  it("makes matching callbacks a no-op, by source and delay", () => {
    const win = freshWindow();
    const { callbacks } = recordDelays(win, "setTimeout");
    preventSetTimeout(win, "showAd", "500-1000");
    win.setTimeout(ad, 800);
    win.setTimeout(ad, 2000);
    win.setTimeout(other, 800);
    expect(callbacks[0]).not.toBe(ad);
    expect(callbacks.slice(1)).toEqual([ad, other]);
  });

  it("turns a test around with !", () => {
    const win = freshWindow();
    const { callbacks } = recordDelays(win, "setTimeout");
    preventSetTimeout(win, "!showAd");
    win.setTimeout(ad, 1);
    win.setTimeout(other, 1);
    expect(callbacks[0]).toBe(ad);
    expect(callbacks[1]).not.toBe(other);
  });

  it("still runs the timer it defused, without the callback", async () => {
    const win = freshWindow();
    preventSetTimeout(win, "showAd");
    let called = false;
    const id = win.setTimeout(() => {
      called = true;
      return "showAd";
    }, 0);
    expect(typeof id).toBe("number");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(called).toBe(false);
  });
});

describe("adjust-setTimeout and adjust-setInterval", () => {
  const countdown = () => "countdown";

  it("speeds up matching 1000 ms timers 20 times by default", () => {
    const win = freshWindow();
    const { delays } = recordDelays(win, "setTimeout");
    adjustSetTimeout(win, "countdown");
    win.setTimeout(countdown, 1000);
    win.setTimeout(countdown, 500);
    win.setTimeout(() => "other", 1000);
    expect(delays).toEqual([50, 500, 1000]);
  });

  it("takes any delay with * and keeps the multiplier within 0.02 to 50", () => {
    const win = freshWindow();
    const { delays } = recordDelays(win, "setInterval");
    adjustSetInterval(win, "", "*", "100");
    win.setInterval(countdown, 10);
    expect(delays).toEqual([500]);
  });

  it("follows the list's YouTube rule (nano-stb, [native code], 17000, 0.001)", () => {
    const win = freshWindow();
    const { delays } = recordDelays(win, "setTimeout");
    adjustSetTimeout(win, "[native code]", "17000", "0.001");
    win.setTimeout(win.alert.bind(win), 17000);
    expect(delays).toEqual([340]);
  });
});
