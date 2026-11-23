import { browser } from "wxt/browser";
import { isPresenceRequest, type Presence } from "../messaging/page-protocol";
import { whenSetUp } from "../messaging/setup";

/**
 * A content script's way in (ui.md "First-run consent"): it handles nothing of the page
 * until this device is set up. It says it is there from the start, so that coming back
 * from the setup reloads only a page without it, or one that needs its load again
 * (`needsPageLoad`: the hooks saw nothing of a load before the consent).
 */
export function runWhenSetUp(
  ctx: { onInvalidated(callback: () => void): unknown },
  start: () => unknown,
  {
    waiting,
    needsPageLoad = false,
  }: { waiting?: () => void; needsPageLoad?: boolean } = {},
): void {
  let missedLoad = false;
  const onMessage = (
    message: unknown,
    _sender: unknown,
    sendResponse: (response: Presence) => void,
  ) => {
    if (!isPresenceRequest(message)) return;
    sendResponse({ reload: needsPageLoad && missedLoad });
    return true;
  };
  browser.runtime.onMessage.addListener(onMessage);
  const cancel = whenSetUp(
    () => {
      Promise.resolve()
        .then(start)
        .catch((error: unknown) => console.error(error));
    },
    () => {
      missedLoad = true;
      waiting?.();
    },
  );
  ctx.onInvalidated(() => {
    cancel();
    browser.runtime.onMessage.removeListener(onMessage);
  });
}
