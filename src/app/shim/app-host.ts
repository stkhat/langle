import {
  TRANSLATOR_STATUSES,
  type AppHost,
  type AppTranslator,
  type ModelProgress,
  type TranslatorStatus,
} from "../../core/app-host";
import type { Bridge } from "../bridge/bridge";
import { createEvent } from "./events";

/** A status native code sent, or `unavailable` for anything else. */
const statusOf = (value: unknown): TranslatorStatus =>
  TRANSLATOR_STATUSES.find((status) => status === value) ?? "unavailable";

/**
 * The app's `appHost` over the bridge: each method is a call the shells answer, and
 * `translator` the value native code put in `__langleAppInfo` (none: no translation
 * host in this app yet).
 */
export function createAppHost(
  bridge: Bridge,
  translator?: AppTranslator,
): AppHost {
  const progress = createEvent<[ModelProgress]>();
  bridge.on("appHost.models.onProgress", ([event]) => {
    progress.emit(event as ModelProgress);
  });
  return {
    openPage: async (url) => {
      await bridge.call("appHost.openPage", url);
    },
    shareFile: async ({ name, mime, text }) => {
      await bridge.call("appHost.shareFile", { name, mime, text });
    },
    nativeStrings: async ({ locale, dir, strings }) => {
      await bridge.call("appHost.nativeStrings", { locale, dir, strings });
    },
    ...(translator && { translator }),
    translate: async ({ from, to, text, start }) => {
      const value = await bridge.call("appHost.translate", {
        from,
        to,
        text,
        start,
      });
      return typeof value === "string" ? value : null;
    },
    translatorStatus: async ({ from, to }) =>
      statusOf(await bridge.call("appHost.translatorStatus", { from, to })),
    prepareTranslator: async ({ from, to }) =>
      statusOf(await bridge.call("appHost.prepareTranslator", { from, to })),
    models: {
      ensure: async (request) => {
        await bridge.call("appHost.models.ensure", request);
      },
      remove: async (pack) => {
        await bridge.call("appHost.models.remove", { pack });
      },
      onProgress: (listener) => {
        progress.addListener(listener);
        return () => progress.removeListener(listener);
      },
    },
  };
}
