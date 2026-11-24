import { fromUser } from "../../ui/from-user";
import {
  createRecognizer,
  LONG_PRESS_MS,
  type Gesture,
  type TouchInput,
} from "./gestures";

/** Where a gesture happened: its point in the viewport, and what the finger went down on. */
export interface TouchPoint {
  x: number;
  y: number;
  /** The press's `pointerdown` path (`composedPath()`), innermost first. */
  path: readonly EventTarget[];
}

export interface TouchCallbacks {
  tap?(at: TouchPoint): void;
  longPress?(at: TouchPoint): void;
  /** The finger moved after a long-press. */
  drag?(at: TouchPoint): void;
  /** The finger left after a long-press. */
  release?(at: TouchPoint): void;
}

/**
 * Feeds the touches on `root` to a recognizer (gestures.ts) and calls back with its
 * gestures. Only the user's fingers count: pointer events a page script dispatched (not
 * `isTrusted`) and those of a mouse or a pen are ignored. One finger makes a gesture; a
 * second one on the screen drops it. Returns a stop.
 */
export function listenTouches(
  root: EventTarget,
  callbacks: TouchCallbacks,
): () => void {
  const recognizer = createRecognizer();
  /** The fingers on the screen. */
  const down = new Set<number>();
  /** The finger whose gesture is being recognized. */
  let primary: number | undefined;
  let path: readonly EventTarget[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  function emit(gesture: Gesture | undefined) {
    if (!gesture || gesture.type === "scroll") {
      if (gesture) clearTimeout(timer);
      return;
    }
    const at = { x: gesture.x, y: gesture.y, path };
    if (gesture.type !== "longPress") clearTimeout(timer);
    callbacks[gesture.type]?.(at);
  }

  const feed = (input: TouchInput) => emit(recognizer.feed(input));

  const isFinger = (event: Event): event is PointerEvent =>
    event instanceof PointerEvent &&
    event.pointerType === "touch" &&
    fromUser(event);

  function onDown(event: Event) {
    if (!isFinger(event)) return;
    const first = down.size === 0;
    down.add(event.pointerId);
    if (!first && primary === undefined) return;
    if (first) {
      primary = event.pointerId;
      path = event.composedPath();
      clearTimeout(timer);
      timer = setTimeout(
        () => feed({ type: "tick", t: performance.now() }),
        LONG_PRESS_MS,
      );
    }
    feed({
      type: "down",
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
    });
  }

  function onMove(event: Event) {
    if (!isFinger(event) || event.pointerId !== primary) return;
    feed({
      type: "move",
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
    });
  }

  function onEnd(event: Event) {
    if (!isFinger(event)) return;
    down.delete(event.pointerId);
    if (event.pointerId !== primary) return;
    primary = undefined;
    clearTimeout(timer);
    feed(
      event.type === "pointercancel"
        ? { type: "cancel", t: event.timeStamp }
        : {
            type: "up",
            x: event.clientX,
            y: event.clientY,
            t: event.timeStamp,
          },
    );
  }

  const options = { capture: true, passive: true } as const;
  root.addEventListener("pointerdown", onDown, options);
  root.addEventListener("pointermove", onMove, options);
  root.addEventListener("pointerup", onEnd, options);
  root.addEventListener("pointercancel", onEnd, options);
  return () => {
    clearTimeout(timer);
    root.removeEventListener("pointerdown", onDown, options);
    root.removeEventListener("pointermove", onMove, options);
    root.removeEventListener("pointerup", onEnd, options);
    root.removeEventListener("pointercancel", onEnd, options);
  };
}
