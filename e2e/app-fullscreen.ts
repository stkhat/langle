import type { Page } from "@playwright/test";
import {
  APP_FULLSCREEN_NAMES,
  installAppFullscreen,
} from "../src/app/fullscreen/app-fullscreen";

/** Removes the page world's element fullscreen, as the iPhone's WebKit has none. */
function hideElementFullscreen() {
  const hidden: [object, string[]][] = [
    [Element.prototype, ["requestFullscreen", "webkitRequestFullscreen"]],
    [
      Document.prototype,
      [
        "exitFullscreen",
        "fullscreenElement",
        "fullscreenEnabled",
        "fullscreen",
      ],
    ],
  ];
  for (const [target, names] of hidden) {
    for (const name of names) Reflect.deleteProperty(target, name);
  }
}

/**
 * The iPhone app's page world in desktop Chromium (docs/plans/mobile-app.md "M3e"): no
 * element fullscreen, the shell's handler (recording what it is told in
 * `__appFullscreen`), and the app's own stand-in, injected from its source as the iOS
 * shell injects `langle-fullscreen.js`. Langle's isolated world keeps the browser's
 * own `document.fullscreenElement`, which stays null, as on the iPhone.
 */
export async function asIPhoneApp(page: Page) {
  const handler = `{ postMessage(body) { (window.__appFullscreen ??= []).push(body); } }`;
  await page.addInitScript({
    content: `(${hideElementFullscreen.toString()})();
window.webkit = { messageHandlers: { ${APP_FULLSCREEN_NAMES.handler}: ${handler} } };
(${installAppFullscreen.toString()})(${JSON.stringify(APP_FULLSCREEN_NAMES)});`,
  });
}

/** What the page told the shell (`on` / `off`). */
export const toldShell = (page: Page) =>
  page.evaluate(
    () => (window as { __appFullscreen?: string[] }).__appFullscreen ?? [],
  );
