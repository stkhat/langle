/** A page whose primary pointer cannot hover and is coarse: a finger on a touch screen. */
export const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";

/**
 * Whether the page is in touch mode: taps and long-presses take the place of hover and
 * clicks, and the dictionary opens as a sheet. A desktop with a mouse is never in it.
 */
export interface TouchMode {
  on(): boolean;
  /** Calls `listener` when the mode changes (a device switched in DevTools, a tablet's keyboard). */
  watch(listener: (on: boolean) => void): () => void;
}

/** Touch mode from `TOUCH_QUERY`; `match` is `matchMedia` but in tests. */
export function createTouchMode(
  match: (query: string) => MediaQueryList = (query) => matchMedia(query),
): TouchMode {
  const list = match(TOUCH_QUERY);
  return {
    on: () => list.matches,
    watch(listener) {
      const onChange = (event: { matches: boolean }) => listener(event.matches);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
  };
}
