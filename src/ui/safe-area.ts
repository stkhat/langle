/** Distances from the window's edges (px). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** No safe area (a desktop; a phone held upright, under its status bar). */
export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export const sameInsets = (a: Insets, b: Insets) =>
  a.top === b.top &&
  a.right === b.right &&
  a.bottom === b.bottom &&
  a.left === b.left;

/**
 * Reads the screen's safe area (`env(safe-area-inset-*)`: the edges a phone's camera
 * island, rounded corners and home bar take) through a hidden element on the page,
 * made on the first read. Zero where the page does not reach under them (no
 * `viewport-fit=cover`) or the browser has none.
 */
export function safeAreaReader(doc: Document = document): {
  read(): Insets;
  remove(): void;
} {
  let probe: HTMLElement | undefined;
  return {
    read() {
      if (!probe?.isConnected) {
        probe = doc.createElement("langle-safe-area");
        probe.style.cssText =
          "position: fixed; top: 0; left: 0; width: 0; height: 0;" +
          " visibility: hidden; pointer-events: none; box-sizing: content-box;" +
          " padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)" +
          " env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);";
        doc.documentElement.append(probe);
      }
      const style = getComputedStyle(probe);
      const px = (value: string) => Math.round(parseFloat(value) || 0);
      return {
        top: px(style.paddingTop),
        right: px(style.paddingRight),
        bottom: px(style.paddingBottom),
        left: px(style.paddingLeft),
      };
    },
    remove() {
      probe?.remove();
    },
  };
}
