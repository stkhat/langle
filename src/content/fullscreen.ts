/**
 * The attribute the phone app's stand-in for element fullscreen puts on the box it
 * shows over the window (`src/app/fullscreen/`, docs/plans/mobile-app.md "M3e"), where
 * the browser has no element fullscreen of its own (the iPhone's WebKit).
 */
export const APP_FULLSCREEN_ATTRIBUTE = "data-langle-app-fullscreen";
/** The stand-in's mark on the shown box's ancestors, `<html>` among them. */
export const APP_FULLSCREEN_ANCESTOR = "data-langle-app-fullscreen-ancestor";

/**
 * The element in fullscreen, or null: the box the app's stand-in shows, else the
 * browser's own. Langle's world does not see the page world's `fullscreenElement`
 * getter (which answers the element the page asked for, a video say), but it sees the
 * stand-in's marks, and its `fullscreenchange` (DOM events reach every world).
 */
export function fullscreenElement(): Element | null {
  if (document.documentElement.hasAttribute(APP_FULLSCREEN_ANCESTOR)) {
    const shown = document.querySelector(`[${APP_FULLSCREEN_ATTRIBUTE}]`);
    if (shown) return shown;
  }
  return document.fullscreenElement ?? null;
}
