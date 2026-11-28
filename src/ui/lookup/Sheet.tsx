import type { ComponentChildren } from "preact";
import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { appHostOf } from "../../core/app-host";
import { fromUser } from "../from-user";
import { keepOpen } from "../keep-open";
import {
  ScreenFrame,
  onScreen,
  screenView,
  useScreenView,
} from "../screen-view";
import { color, root } from "../styles";

/** How far a swipe on the handle must go to change the sheet's height (screen px). */
const SWIPE_PX = 40;

/** Mock Mobile*: the sheet's shadow over the page and its rounded top. */
const SHADOW = "0 -10px 30px rgba(20,24,43,0.18)";

/** Over everything on the page. */
const Z_TOP = 2147483647;

/** A press on the grab area that may become a swipe. */
interface Swipe {
  pointerId: number;
  startY: number;
  dy: number;
}

/** How many sheets show now, and what the phone app was last told. */
let shown = 0;
let told = false;
let telling: ReturnType<typeof setTimeout> | undefined;

/**
 * Tells the phone app whether a sheet shows (`appHost.pageSheet`): its title bar slides
 * away meanwhile (mock `MobileArticle`, `MobileYouTube`). Once the page settles, so a
 * sheet that remounts (another word looked up) does not bring the bar back between.
 */
function tellShown(change: 1 | -1): void {
  shown += change;
  const tell = appHostOf()?.pageSheet;
  if (!tell) return;
  clearTimeout(telling);
  telling = setTimeout(() => {
    const open = shown > 0;
    if (open === told) return;
    told = open;
    tell(open).catch(() => {});
  }, 0);
}

/**
 * A bottom sheet: the phone's frame for the dictionary (mock Mobile*'s dictionary sheet).
 * It fills the screen's width from `top` (half height) to the bottom. Its grab area
 * (the handle and the `header` row) takes swipes: up gives it the full height, down
 * brings it back to half height, or closes it from there. Its body scrolls by itself.
 * It sits on the screen, not the page: a page laid out wider than the phone (no viewport
 * meta) or zoomed by a pinch does not shrink or move it (`ScreenFrame`).
 */
export function Sheet(props: {
  /** The sheet's accessible name. */
  label: string;
  /**
   * Its top at half height, in the page's px from the window's top (as
   * `getBoundingClientRect`) in the view of the page when it is given.
   */
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
  const view = useScreenView();

  // Before paint, so a sheet that replaces another (same render) keeps the count up.
  useLayoutEffect(() => {
    tellShown(1);
    return () => tellShown(-1);
  }, []);

  function onPointerDown(event: PointerEvent) {
    if (!fromUser(event) || event.button !== 0) return;
    // A press on × or another control in the row is its own.
    const target = event.composedPath()[0];
    if (target instanceof Element && target.closest("button, a, input")) return;
    swipe.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      dy: 0,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    const now = swipe.current;
    if (!now || now.pointerId !== event.pointerId || !fromUser(event)) return;
    now.dy = onScreen(view, event.clientY - now.startY);
    setDy(now.dy);
  }

  function onPointerUp(event: PointerEvent) {
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

  // In the screen's px from the top of the screen, taken from the view when `top` is
  // given: a later pinch or pan of the page leaves the sheet where it is on the screen.
  const half = useMemo(() => {
    const now = screenView();
    return Math.max(0, onScreen(now, props.top - now.top));
  }, [props.top]);
  const top = Math.max(0, (full ? 0 : half) + dy);
  return (
    <ScreenFrame view={view} zIndex={Z_TOP}>
      <aside
        aria-label={props.label}
        onKeyDown={props.onKeyDown}
        onPointerDown={keepOpen}
        style={root({
          position: "fixed",
          zIndex: Z_TOP,
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
          pointerEvents: "auto",
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
    </ScreenFrame>
  );
}
