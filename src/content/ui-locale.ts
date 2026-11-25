import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { followUiLocale } from "../i18n/ui-locale";
import { send } from "../messaging/client";
import { watchSettings } from "../messaging/storage";
import { sendWhileConnected } from "./orphan";

/**
 * A content script's `start` that runs once the interface language is there, which it
 * then follows (architecture "Interface language"). A locale's messages come from the
 * background: the locale files are not web-accessible, so pages cannot read them, and
 * the content scripts carry English only.
 */
export function inUiLocale(
  ctx: ContentScriptContext,
  start: () => unknown,
): () => Promise<unknown> {
  const request = sendWhileConnected(ctx, send);
  return async () => {
    const unwatch = await followUiLocale({
      getSettings: () => request({ type: "getSettings" }),
      watchSettings,
      load: (locale) => request({ type: "uiMessages", locale }),
    });
    ctx.onInvalidated(unwatch);
    return start();
  };
}
