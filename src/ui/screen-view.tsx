import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";

/**
 * The part of the page on the screen (the visual viewport), in the page's CSS px from
 * the layout viewport's top left (where `position: fixed` and `getBoundingClientRect`
 * measure from), and how far it is zoomed. A page without a viewport meta is laid out
 * 980 px wide and shown at about 0.4 on a phone; a pinch zooms any page.
 */
export interface ScreenView {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
}

/** The screen's view of the page now; the window's box where there is no `visualViewport`. */
export function screenView(w: Window = window): ScreenView {
  const view = w.visualViewport;
  if (!view)
    return {
      left: 0,
      top: 0,
      width: w.innerWidth,
      height: w.innerHeight,
      scale: 1,
    };
  return {
    left: view.offsetLeft,
    top: view.offsetTop,
    width: view.width,
    height: view.height,
    scale: view.scale > 0 ? view.scale : 1,
  };
}

const same = (a: ScreenView, b: ScreenView) =>
  a.left === b.left &&
  a.top === b.top &&
  a.width === b.width &&
  a.height === b.height &&
  a.scale === b.scale;

/** `screenView()`, again whenever the view zooms, scrolls or resizes. */
export function useScreenView(): ScreenView {
  const [view, setView] = useState(screenView);
  useEffect(() => {
    const follow = () =>
      setView((now) => {
        const next = screenView();
        return same(now, next) ? now : next;
      });
    follow();
    const visual = window.visualViewport;
    visual?.addEventListener("resize", follow);
    visual?.addEventListener("scroll", follow);
    addEventListener("resize", follow);
    return () => {
      visual?.removeEventListener("resize", follow);
      visual?.removeEventListener("scroll", follow);
      removeEventListener("resize", follow);
    };
  }, []);
  return view;
}

/**
 * A layer over the screen for Langle's fixed UI on a phone (the dictionary sheet): it
 * covers the visual viewport and is laid out in the screen's px, so what is in it keeps
 * its size and place whatever the page's zoom (a page laid out wider than the phone, a
 * pinch). Its transform makes it the box `position: fixed` inside it is placed in. It
 * takes no presses itself.
 */
export function ScreenFrame(props: {
  view: ScreenView;
  zIndex: number;
  children: ComponentChildren;
}) {
  const { view } = props;
  return (
    <div
      data-screen-frame
      style={{
        position: "fixed",
        left: `${view.left}px`,
        top: `${view.top}px`,
        width: `${view.width * view.scale}px`,
        height: `${view.height * view.scale}px`,
        transform: `scale(${1 / view.scale})`,
        transformOrigin: "0 0",
        zIndex: props.zIndex,
        pointerEvents: "none",
      }}
    >
      {props.children}
    </div>
  );
}

/** A distance on the page (CSS px, as `getBoundingClientRect` gives) in the screen's px. */
export const onScreen = (view: ScreenView, px: number) => px * view.scale;
