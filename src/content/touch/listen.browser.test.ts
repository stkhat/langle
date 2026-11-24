import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { canTouch, longPress, pinch, swipe, tap } from "../../testing/touch";
import { middleOf } from "../../testing/mouse";
import { listenTouches, type TouchPoint } from "./listen";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function setup() {
  const box = document.createElement("div");
  box.style.cssText = "width: 300px; height: 300px; touch-action: none";
  const inner = document.createElement("span");
  inner.textContent = "word";
  box.append(inner);
  document.body.append(box);
  const log: string[] = [];
  const at = (name: string) => (p: TouchPoint) =>
    log.push(
      `${name} ${Math.round(p.x)},${Math.round(p.y)}${p.target === inner ? " on word" : ""}`,
    );
  const stop = listenTouches(document, {
    tap: at("tap"),
    longPress: at("longPress"),
    drag: at("drag"),
    release: at("release"),
  });
  cleanups.push(stop, () => box.remove());
  const r = box.getBoundingClientRect();
  const p = (x: number, y: number) => ({ x: r.left + x, y: r.top + y });
  return { log, inner, p, stop };
}

describe.runIf(canTouch)("listenTouches", () => {
  it("calls tap with the point and what the finger went down on", async () => {
    const { log, inner } = setup();
    const word = middleOf(inner);
    await tap(word);
    await expect.poll(() => log).toHaveLength(1);
    expect(log[0]).toBe(
      `tap ${Math.round(word.x)},${Math.round(word.y)} on word`,
    );
  });

  it("calls longPress, drag and release for a long-press and drag", async () => {
    const { log, p } = setup();
    await longPress([p(20, 20), p(80, 20), p(120, 40)]);
    await expect.poll(() => log.at(-1)).toMatch(/^release/);
    const r = (x: number, y: number) => {
      const q = p(x, y);
      return `${Math.round(q.x)},${Math.round(q.y)}`;
    };
    expect(log).toEqual([
      `longPress ${r(20, 20)}`,
      `drag ${r(80, 20)}`,
      `drag ${r(120, 40)}`,
      `release ${r(120, 40)}`,
    ]);
  });

  it("gives nothing for a swipe, which scrolls", async () => {
    const { log, p } = setup();
    await swipe([p(50, 50), p(50, 80), p(50, 140)]);
    await tap(p(10, 10));
    await expect.poll(() => log).toHaveLength(1);
    expect(log[0]).toMatch(/^tap/);
  });

  it("drops the gesture when a second finger comes down", async () => {
    const { log, p } = setup();
    await pinch(p(20, 20), p(200, 200));
    await tap(p(10, 10));
    await expect.poll(() => log).toHaveLength(1);
    expect(log[0]).toMatch(/^tap/);
  });

  it("ignores the mouse and pointer events a page script dispatched", async () => {
    const { log, inner, p } = setup();
    await userEvent.click(inner);
    const fake = (type: string) =>
      inner.dispatchEvent(
        new PointerEvent(type, {
          pointerType: "touch",
          pointerId: 9,
          bubbles: true,
          clientX: 5,
          clientY: 5,
        }),
      );
    fake("pointerdown");
    fake("pointerup");
    await tap(p(10, 10));
    await expect.poll(() => log).toHaveLength(1);
    expect(log[0]).toMatch(/^tap/);
  });

  it("stops listening", async () => {
    const { log, p, stop } = setup();
    stop();
    await tap(p(10, 10));
    await longPress([p(10, 10)], 600);
    expect(log).toEqual([]);
  });
});
