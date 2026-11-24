// A finger on the test page: real touches through vitest.config.ts `touch` (CDP's
// Input.dispatchTouchEvent), which Chromium turns into trusted pointer events with
// pointerType "touch", and a click after a tap. Chromium only.
import { commands, server } from "vitest/browser";
import type { Point } from "./mouse";
import type { TouchMode } from "../content/touch/touch-mode";

interface TouchStep {
  type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel";
  points: { x: number; y: number; id?: number }[];
}

declare module "vitest/browser" {
  interface BrowserCommands {
    touch(steps: TouchStep[]): Promise<void>;
  }
}

/** CDP touches exist only in Chromium: touch tests skip the other browsers. */
export const canTouch = server.browser === "chromium";

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** A tap at `point`: down and up at once. */
export async function tap(point: Point) {
  await commands.touch([
    { type: "touchStart", points: [point] },
    { type: "touchEnd", points: [] },
  ]);
}

/**
 * A press at the first point held `holdMs` (a long-press with the default), then moved
 * through the other points, then lifted at the last.
 */
export async function longPress(
  points: readonly Point[],
  holdMs = 700,
): Promise<void> {
  const [first, ...rest] = points;
  if (!first) return;
  await commands.touch([{ type: "touchStart", points: [first] }]);
  await wait(holdMs);
  for (const point of rest)
    await commands.touch([{ type: "touchMove", points: [point] }]);
  await commands.touch([{ type: "touchEnd", points: [] }]);
}

/** A swipe from the first point through the others, a frame apart, then lifted. */
export async function swipe(points: readonly Point[]): Promise<void> {
  const [first, ...rest] = points;
  if (!first) return;
  await commands.touch([{ type: "touchStart", points: [first] }]);
  for (const point of rest) {
    await wait(16);
    await commands.touch([{ type: "touchMove", points: [point] }]);
  }
  await commands.touch([{ type: "touchEnd", points: [] }]);
}

/** Two fingers down, then both lifted. */
export async function pinch(a: Point, b: Point) {
  await commands.touch([
    { type: "touchStart", points: [{ ...a, id: 1 }] },
    {
      type: "touchStart",
      points: [
        { ...a, id: 1 },
        { ...b, id: 2 },
      ],
    },
  ]);
  await wait(700);
  await commands.touch([{ type: "touchEnd", points: [] }]);
}

/** Touch mode forced on or off, for the tests of what the page does in it. */
export function fixedTouchMode(on: boolean): TouchMode {
  return { on: () => on, watch: () => () => {} };
}
