import { fromUser } from "../../ui/from-user";
import { isLangleHost } from "../../ui/langle-host";
import type { Box } from "../lookup/geometry";
import { createHoverIntent } from "../lookup/hover-intent";
import { listenTouches } from "../../ui/touch/listen";
import { TOUCH_QUERY } from "../touch/touch-mode";
import type { SpanRef } from "./locate";

export interface InteractionCallbacks {
  /** The span under a viewport point that has a card, if any. */
  spanAt(x: number, y: number): SpanRef | undefined;
  /** The card for `ref`, over `anchor` when given (a Words row's head), else the word. */
  showHover(ref: SpanRef, anchor?: Box): void;
  hideHover(): void;
  /** A word was clicked. */
  click(ref: SpanRef): void;
  /** The page's selection settled (the pointer is up); undefined when it is collapsed. */
  selection(range: Range | undefined): void;
  escape(): void;
  /** The user pressed the page somewhere other than a word a click opens. */
  pressAway(): void;
  /**
   * Words are selected for a phrase: a press on the page drops the selection first,
   * so it selects anew instead of dragging the selected words.
   */
  selecting(): boolean;
  /** The page or an element in it scrolled, or the window was resized. */
  scroll(): void;
  /**
   * The page is in touch mode (`touch/touch-mode.ts`): no hover card; a tap on a word
   * opens it (`click`), a tap elsewhere is `pressAway`, and a long-press on a word in a
   * link opens it without following the link. The phone's own selection is read once
   * it has settled for `TOUCH_SELECTION_DELAY_MS`.
   */
  touch(): boolean;
}

export interface Interactions {
  /** The pointer entered a Words row's head (`anchor`), which stands for `ref`. */
  enterListed(ref: SpanRef, anchor: Box): void;
  /** The pointer left the row's head. */
  leaveListed(): void;
  /** The pointer is in the hover card. */
  keepHover(): void;
  /** The pointer left the hover card. */
  releaseHover(): void;
  /** Hides the hover card now, as a press on the page does. */
  dismissHover(): void;
  stop(): void;
}

/** Page controls that keep their own clicks: words inside them open no panel. */
const INTERACTIVE =
  "a[href], button, input, textarea, select, label, summary, [role=button], [role=link], [contenteditable]";

/** True when the event happened inside Langle's own UI (a `langle-*` shadow host). */
function inLangleUi(event: Event): boolean {
  return event.composedPath().some(isLangleHost);
}

/** How long the selection must stay unchanged before it is read (ms). */
const SELECTION_DELAY_MS = 100;
/**
 * The same in touch mode: the phone's selection changes while a finger drags its
 * handles, and pauses as the finger does; it is snapped only once it rests.
 */
const TOUCH_SELECTION_DELAY_MS = 500;

/** A link: a tap on its words follows it, a long-press opens the word. */
const LINK = "a[href], [role=link]";

/**
 * Touch mode: a long-pressed link is Langle's alone. WebKit on iOS fires no
 * `contextmenu` there; its link menu (and preview) takes the touch over, and only
 * `-webkit-touch-callout: none` keeps it away. Without the menu its long-press selects
 * text instead, in the sheet that opened under the finger, so the link's text is not
 * selectable either. Desktops are never in touch mode.
 */
const LINK_TOUCH_CSS = `@media ${TOUCH_QUERY} { ${LINK} { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; } }`;

const elements = (path: readonly EventTarget[]) =>
  path.filter((target): target is Element => target instanceof Element);

const same = (a: SpanRef | undefined, b: SpanRef | undefined) =>
  a === b ||
  (!!a && !!b && a.block === b.block && a.span.start === b.span.start);

/** A word the pointer is on: on the page, or a Words row's head standing for it. */
interface HoverTarget {
  ref: SpanRef;
  /** The row's head; none for a word on the page. */
  anchor?: Box;
}

const sameTarget = (a: HoverTarget, b: HoverTarget) =>
  same(a.ref, b.ref) && !a.anchor === !b.anchor;

/**
 * Turns pointer, selection, keyboard and scroll events on the page into hover, click,
 * selection, Escape and scroll callbacks; events a page script dispatched (not
 * `isTrusted`) are ignored. The pointer is read once per animation frame; cards show
 * and hide as `createHoverIntent` says.
 */
export function watchInteractions(cb: InteractionCallbacks): Interactions {
  const hover = createHoverIntent<HoverTarget>(
    {
      show: ({ ref, anchor }) => cb.showHover(ref, anchor),
      hide: cb.hideHover,
    },
    sameTarget,
  );
  /** The word under the pointer. */
  let candidate: SpanRef | undefined;
  let frame: number | undefined;
  let lastMove: PointerEvent | undefined;
  /** A button is down on the page: the selection is still being made. */
  let pressed = false;
  let selectionTimer: ReturnType<typeof setTimeout> | undefined;
  /** Touch mode: this press long-pressed a word in a link, which opened instead. */
  let linkPress = false;

  function hideNow() {
    candidate = undefined;
    hover.cancel();
  }

  function track(event: PointerEvent) {
    if (inLangleUi(event)) return;
    const ref =
      event.buttons === 0 ? cb.spanAt(event.clientX, event.clientY) : undefined;
    if (same(ref, candidate)) return;
    candidate = ref;
    if (ref) hover.enter({ ref });
    else hover.leave();
  }

  function onPointerMove(event: PointerEvent) {
    if (!fromUser(event) || cb.touch()) return;
    lastMove = event;
    frame ??= requestAnimationFrame(() => {
      frame = undefined;
      if (lastMove) track(lastMove);
    });
  }

  function onPointerDown(event: PointerEvent) {
    if (!fromUser(event)) return;
    // A new press: whatever it clicks is its own.
    linkPress = false;
    if (inLangleUi(event)) return;
    pressed = true;
    hideNow();
    // A tap or a long-press decides (`listenTouches` below); a press may be a scroll.
    if (cb.touch()) return;
    if (event.button === 0 && !event.shiftKey && cb.selecting())
      getSelection()?.removeAllRanges();
    if (!opensWord(event)) cb.pressAway();
  }

  function readSelection(delay: number) {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      const selection = getSelection();
      cb.selection(
        selection && selection.rangeCount > 0 && !selection.isCollapsed
          ? selection.getRangeAt(0)
          : undefined,
      );
    }, delay);
  }

  /** The press ended, or the browser took it over (`pointercancel`). */
  function onPointerUp(event: PointerEvent) {
    if (!fromUser(event) || !pressed) return;
    pressed = false;
    readSelection(0);
  }

  function onSelectionChange() {
    // In touch mode the rest alone settles it: WebKit on iOS takes a long-press or a
    // handle's drag over without a `pointerup` or `pointercancel` to the page.
    if (cb.touch()) readSelection(TOUCH_SELECTION_DELAY_MS);
    else if (!pressed) readSelection(SELECTION_DELAY_MS);
  }

  /** Opens the word at a point in a link, pressed long; true when there is one. */
  function openLinkWord(x: number, y: number): boolean {
    const ref = cb.spanAt(x, y);
    if (!ref) return false;
    linkPress = true;
    hideNow();
    cb.click(ref);
    return true;
  }

  const inLink = (path: readonly EventTarget[]) =>
    elements(path).some((element) => element.matches(LINK));

  /**
   * Touch mode: a long-press shows the link's menu (`contextmenu`), maybe before the
   * long-press timer below fires. On a word in a link the word opens instead.
   */
  function onContextMenu(event: MouseEvent) {
    if (!fromUser(event) || !cb.touch() || inLangleUi(event)) return;
    if (
      linkPress ||
      (inLink(event.composedPath()) &&
        openLinkWord(event.clientX, event.clientY))
    )
      event.preventDefault();
  }

  /** A click at the event's point would open a word (see `onClick`). */
  function opensWord(event: MouseEvent): boolean {
    const target = event.target;
    if (target instanceof Element && target.closest(INTERACTIVE)) return false;
    return cb.spanAt(event.clientX, event.clientY) !== undefined;
  }

  function onClick(event: MouseEvent) {
    if (fromUser(event) && cb.touch()) {
      // Taps are read from the touches; a long-pressed link word does not follow it.
      if (linkPress) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (!fromUser(event) || event.button !== 0 || inLangleUi(event)) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    if (getSelection()?.isCollapsed === false) return;
    const target = event.target;
    if (target instanceof Element && target.closest(INTERACTIVE)) return;
    const ref = cb.spanAt(event.clientX, event.clientY);
    if (ref) cb.click(ref);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (fromUser(event) && event.key === "Escape" && !inLangleUi(event))
      cb.escape();
  }

  let scrollFrame: number | undefined;
  function onScroll() {
    hideNow();
    scrollFrame ??= requestAnimationFrame(() => {
      scrollFrame = undefined;
      cb.scroll();
    });
  }

  const passive = { capture: true, passive: true } as const;
  document.addEventListener("pointermove", onPointerMove, passive);
  document.addEventListener("pointerdown", onPointerDown, passive);
  document.addEventListener("pointerup", onPointerUp, passive);
  document.addEventListener("pointercancel", onPointerUp, passive);
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", onScroll, passive);
  window.addEventListener("resize", onScroll, passive);
  document.addEventListener("contextmenu", onContextMenu, true);
  const callout = new CSSStyleSheet();
  callout.replaceSync(LINK_TOUCH_CSS);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, callout];
  const stopTouches = listenTouches(document, {
    tap({ x, y, path }) {
      if (!cb.touch() || path.some(isLangleHost)) return;
      // The page's own control (a link: the tap follows it) takes the tap.
      const ref = elements(path).some((element) => element.matches(INTERACTIVE))
        ? undefined
        : cb.spanAt(x, y);
      if (ref) cb.click(ref);
      else cb.pressAway();
    },
    longPress({ x, y, path }) {
      // Elsewhere a long-press is the phone's own selection.
      if (cb.touch() && !linkPress && !path.some(isLangleHost) && inLink(path))
        openLinkWord(x, y);
    },
  });

  return {
    enterListed(ref, anchor) {
      candidate = undefined;
      hover.enter({ ref, anchor });
    },
    leaveListed: () => hover.leave(),
    keepHover() {
      candidate = undefined;
      hover.keep();
    },
    releaseHover() {
      candidate = undefined;
      hover.release();
    },
    dismissHover: hideNow,
    stop() {
      hover.cancel();
      clearTimeout(selectionTimer);
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
      document.removeEventListener("pointermove", onPointerMove, passive);
      document.removeEventListener("pointerdown", onPointerDown, passive);
      document.removeEventListener("pointerup", onPointerUp, passive);
      document.removeEventListener("pointercancel", onPointerUp, passive);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScroll, passive);
      window.removeEventListener("resize", onScroll, passive);
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (sheet) => sheet !== callout,
      );
      stopTouches();
    },
  };
}
