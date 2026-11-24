/** A tap is released within this many ms of the press... */
export const TAP_MAX_MS = 500;
/** ...a long-press is held this long... */
export const LONG_PRESS_MS = 500;
/** ...and both move less than this many px from where the finger went down. */
export const SLOP_PX = 10;

/** One finger's touch, in viewport px and ms. */
export type TouchInput =
  | { type: "down"; x: number; y: number; t: number }
  | { type: "move"; x: number; y: number; t: number }
  | { type: "up"; x: number; y: number; t: number }
  | { type: "cancel"; t: number }
  | { type: "tick"; t: number }; // the long-press timer firing

export type Gesture =
  | { type: "tap"; x: number; y: number }
  | { type: "longPress"; x: number; y: number }
  | { type: "drag"; x: number; y: number } // only after a long-press
  | { type: "release"; x: number; y: number } // the end of a long-press or drag
  | { type: "scroll" }; // moved before the long-press: the browser scrolls, Langle does nothing

export interface Recognizer {
  feed(input: TouchInput): Gesture | undefined;
}

type State =
  | { name: "idle" }
  /** Down, not moved past the slop, not held long enough yet. */
  | {
      name: "pressed";
      x0: number;
      y0: number;
      t0: number;
      x: number;
      y: number;
    }
  /** Held past `LONG_PRESS_MS`: every move is a drag. */
  | { name: "held" }
  /** Scrolled, canceled or a second finger: nothing until the next press. */
  | { name: "ignored" };

/**
 * Turns one finger's touch into taps, long-presses with their drags, and scrolls. It
 * has no clock of its own: the caller feeds `tick` when `LONG_PRESS_MS` has passed
 * since the press. A second `down` while a finger is on (a pinch) and `cancel` (the
 * browser took the touch over) drop the gesture, without a release.
 */
export function createRecognizer(): Recognizer {
  let state: State = { name: "idle" };

  return {
    feed(input) {
      switch (input.type) {
        case "down":
          if (state.name === "pressed" || state.name === "held") {
            state = { name: "ignored" };
            return undefined;
          }
          state = {
            name: "pressed",
            x0: input.x,
            y0: input.y,
            t0: input.t,
            x: input.x,
            y: input.y,
          };
          return undefined;
        case "move":
          if (state.name === "held")
            return { type: "drag", x: input.x, y: input.y };
          if (state.name !== "pressed") return undefined;
          if (Math.hypot(input.x - state.x0, input.y - state.y0) >= SLOP_PX) {
            state = { name: "ignored" };
            return { type: "scroll" };
          }
          state.x = input.x;
          state.y = input.y;
          return undefined;
        case "tick":
          if (state.name !== "pressed" || input.t - state.t0 < LONG_PRESS_MS)
            return undefined;
          {
            const { x, y } = state;
            state = { name: "held" };
            return { type: "longPress", x, y };
          }
        case "up": {
          const was = state;
          state = { name: "idle" };
          if (was.name === "held")
            return { type: "release", x: input.x, y: input.y };
          if (
            was.name === "pressed" &&
            input.t - was.t0 < TAP_MAX_MS &&
            Math.hypot(input.x - was.x0, input.y - was.y0) < SLOP_PX
          )
            return { type: "tap", x: input.x, y: input.y };
          return undefined;
        }
        case "cancel":
          state = { name: "idle" };
          return undefined;
      }
    },
  };
}
