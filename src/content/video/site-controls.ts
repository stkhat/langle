import type { Box } from "../lookup/geometry";

/**
 * What a site's control over its video is: what takes a press (a button, a slider, a
 * link) or shows a value on its bar.
 */
const CONTROL =
  "button, [role=button], [role=slider], [role=progressbar], a[href], input";

/**
 * Smaller than this (px, either side) is not a control a finger presses or an eye reads:
 * a site's 12×12 stand-ins for screen readers (m.youtube.com).
 */
const MIN_SIDE = 24;

/** Drawn: displayed, not `visibility: hidden`, not faded out. */
function drawn(element: Element): boolean {
  if (typeof element.checkVisibility === "function")
    return element.checkVisibility({
      opacityProperty: true,
      visibilityProperty: true,
    });
  if (getComputedStyle(element).visibility === "hidden") return false;
  for (let at: Element | null = element; at; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (style.display === "none" || style.opacity === "0") return false;
  }
  return true;
}

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * The boxes (window px) of the site's controls shown now over `over` (the player or the
 * screen), found in `roots` (the elements holding the player and the controls the site
 * draws over it): measured from the page's structure, so a site that moves or restyles
 * them needs nothing new here.
 */
export function shownControls(roots: readonly Element[], over: Box): Box[] {
  const boxes: Box[] = [];
  const seen = new Set<Element>();
  for (const root of roots)
    for (const element of root.querySelectorAll(CONTROL)) {
      if (seen.has(element)) continue;
      seen.add(element);
      const rect = element.getBoundingClientRect();
      if (rect.width < MIN_SIDE || rect.height < MIN_SIDE) continue;
      const box = {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
      };
      if (overlaps(box, over) && drawn(element)) boxes.push(box);
    }
  return boxes;
}

/** The same boxes in the same order. */
export const sameBoxes = (a: readonly Box[], b: readonly Box[]) =>
  a.length === b.length &&
  a.every(
    (box, i) =>
      box.left === b[i]!.left &&
      box.top === b[i]!.top &&
      box.right === b[i]!.right &&
      box.bottom === b[i]!.bottom,
  );

/**
 * Where `place` (a box Langle puts near the top of the video: the Paused pill, the L)
 * goes down to so no control covers it: its own top, or `gap` px under every control it
 * would overlap.
 */
export function topClearOf(
  controls: readonly Box[],
  place: Box,
  gap: number,
): number {
  let top = place.top;
  // Moving down can meet the next control under it.
  for (const control of [...controls].sort((a, b) => a.top - b.top)) {
    const now = { ...place, top, bottom: top + (place.bottom - place.top) };
    if (overlaps(now, control)) top = control.bottom + gap;
  }
  return top;
}

/**
 * The top (window px) of the highest control in the lower half of `area` (the player or
 * the screen): the bar along the bottom (the progress bar, the time, fullscreen) that a
 * subtitle near the bottom keeps above. Null when none shows there.
 */
export function controlsTopIn(
  controls: readonly Box[],
  area: Box,
): number | null {
  const middle = (area.top + area.bottom) / 2;
  let top: number | null = null;
  for (const control of controls)
    if (control.top >= middle && control.top < area.bottom)
      top = top === null ? control.top : Math.min(top, control.top);
  return top;
}
