import type { ComponentChildren, JSX } from "preact";
import { useRef, useState } from "preact/hooks";
import { fromUser } from "../from-user";
import { keepOpen } from "../keep-open";
import { color, root } from "../styles";

/** How far a swipe on the handle must go to change the sheet's height (px). */
const SWIPE_PX = 40;

/** Mock Mobile*: the sheet's shadow over the page and its rounded top. */
const SHADOW = "0 -10px 30px rgba(20,24,43,0.18)";

/** A press on the grab area that may become a swipe. */
interface Swipe {
  pointerId: number;
  startY: number;
  dy: number;
}

/**
 * A bottom sheet: the phone's frame for the dictionary (mock Mobile*'s dictionary sheet).
 * It fills the window's width from `top` (half height) to the bottom. Its grab area
 * (the handle and the `header` row) takes swipes: up gives it the full height, down
 * brings it back to half height, or closes it from there. Its body scrolls by itself.
 */
export function Sheet(props: {
  /** The sheet's accessible name. */
  label: string;
  /** Its top at half height, in px from the window's top. */
  top: number;
  onClose: () => void;
  /** The row under the handle (a status line, ×); swipes start on it too. */
  header?: ComponentChildren;
  onKeyDown?: (event: KeyboardEvent) => void;
  children: ComponentChildren;
}) {
  const [full, setFull] = useState(false);
  const [dy, setDy] = useState(0);
  const swipe = useRef<Swipe | null>(null);

  function onPointerDown(event: JSX.TargetedPointerEvent<HTMLElement>) {
    if (!fromUser(event) || event.button !== 0) return;
    // A press on × or another control in the row is its own.
    const target = event.composedPath()[0];
    if (target instanceof Element && target.closest("button, a, input")) return;
    swipe.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      dy: 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: JSX.TargetedPointerEvent<HTMLElement>) {
    const now = swipe.current;
    if (!now || now.pointerId !== event.pointerId || !fromUser(event)) return;
    now.dy = event.clientY - now.startY;
    setDy(now.dy);
  }

  function onPointerUp(event: JSX.TargetedPointerEvent<HTMLElement>) {
    const now = swipe.current;
    if (!now || now.pointerId !== event.pointerId) return;
    swipe.current = null;
    setDy(0);
    if (!fromUser(event) || event.type === "pointercancel") return;
    if (now.dy <= -SWIPE_PX) setFull(true);
    else if (now.dy >= SWIPE_PX) {
      if (full) setFull(false);
      else props.onClose();
    }
  }

  const top = Math.max(0, (full ? 0 : props.top) + dy);
  return (
    <aside
      aria-label={props.label}
      onKeyDown={props.onKeyDown}
      onPointerDown={keepOpen}
      style={root({
        position: "fixed",
        zIndex: 2147483647,
        left: 0,
        right: 0,
        bottom: 0,
        top: `${top}px`,
        display: "flex",
        flexDirection: "column",
        background: color.card,
        borderRadius: "16px 16px 0 0",
        boxShadow: SHADOW,
        transition: swipe.current ? "none" : "top 0.2s ease",
      })}
    >
      <div
        data-sheet-grab
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          flex: "none",
          display: "flex",
          flexDirection: "column",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <span
          data-sheet-handle
          aria-hidden="true"
          style={{
            alignSelf: "center",
            width: "36px",
            height: "5px",
            marginTop: "8px",
            borderRadius: "3px",
            background: color.lineStrong,
          }}
        ></span>
        {props.header}
      </div>
      <div
        data-sheet-body
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overscrollBehaviorY: "contain",
          padding: "4px 20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        {props.children}
      </div>
    </aside>
  );
}
