import { browser } from "wxt/browser";
import { patternCovers } from "../core/site-access/origins";
import {
  isSiteAccessRemoved,
  type SiteAccessRemoved,
} from "../messaging/site-access";

/** Whether removed grants take the page's access away: none still granted covers it. */
export const losesAccess = (message: SiteAccessRemoved, url: URL) =>
  message.removed.some((pattern) => patternCovers(pattern, url)) &&
  !message.granted.some((pattern) => patternCovers(pattern, url));

/**
 * Takes the article script off the page when the host's grant is removed (popup "On
 * this site" off, or Chrome's own menus): the context is invalidated, which gives the
 * page back as when the site is switched off, and stops answering the popup, as on a
 * page that never had the grant. Turned on again, the background injects a new copy.
 */
export function leaveWhenAccessRemoved(
  ctx: {
    abort(reason?: unknown): void;
    onInvalidated(callback: () => void): unknown;
  },
  pageUrl: () => URL = () => new URL(location.href),
): void {
  const onMessage = (message: unknown) => {
    if (isSiteAccessRemoved(message) && losesAccess(message, pageUrl()))
      ctx.abort("site access removed");
  };
  browser.runtime.onMessage.addListener(onMessage);
  ctx.onInvalidated(() => {
    // A script cut off by an extension reload has no `browser.runtime` any more.
    try {
      browser.runtime.onMessage.removeListener(onMessage);
    } catch {
      // Gone with the extension.
    }
  });
}
