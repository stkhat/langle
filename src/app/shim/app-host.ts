import {
  APP_GOOGLE_AUTH_ERRORS,
  TRANSLATOR_STATUSES,
  type AppGoogleAuth,
  type AppGoogleToken,
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

/** A token answer native code sent, or `unauthorized` for anything else. */
function googleTokenOf(value: unknown): AppGoogleToken {
  const answer = (value ?? {}) as Record<string, unknown>;
  if (
    typeof answer.token === "string" &&
    answer.token !== "" &&
    typeof answer.expiresAt === "number" &&
    Number.isFinite(answer.expiresAt)
  )
    return { token: answer.token, expiresAt: answer.expiresAt };
  const error = APP_GOOGLE_AUTH_ERRORS.find((e) => e === answer.error);
  return { error: error ?? "unauthorized" };
}

/** `appHost.googleAuth` over the bridge. */
const createGoogleAuth = (bridge: Bridge): AppGoogleAuth => ({
  token: async ({ interactive, refused }) =>
    googleTokenOf(
      await bridge.call("appHost.googleAuth.token", {
        interactive,
        ...(refused !== undefined && { refused }),
      }),
    ),
  forget: async () => {
    await bridge.call("appHost.googleAuth.forget");
  },
});

export interface AppHostInfo {
  /** The value native code put in `__langleAppInfo` (none: no translation host yet). */
  translator?: AppTranslator;
  /** Whether the shell can sign in to Google (`__langleAppInfo.googleAuth`). */
  googleAuth?: boolean;
}

/**
 * The app's `appHost` over the bridge: each method is a call the shells answer, each
 * `on…` an event they send, and `translator` and `googleAuth` there only when native
 * code said so in `__langleAppInfo`.
 */
export function createAppHost(bridge: Bridge, info: AppHostInfo = {}): AppHost {
  const { translator } = info;
  const progress = createEvent<[ModelProgress]>();
  bridge.on("appHost.models.onProgress", ([event]) => {
    progress.emit(event as ModelProgress);
  });
  const hidden = createEvent<[], Promise<void>>();
  // Answered once every listener is done, so the shell can let the app sleep.
  bridge.on("app.hidden", async () => {
    await Promise.all(hidden.emit());
  });
  const visible = createEvent<[]>();
  bridge.on("app.visible", () => {
    visible.emit();
  });
  const listen =
    <L>(event: {
      addListener(listener: L): void;
      removeListener(listener: L): void;
    }) =>
    (listener: L) => {
      event.addListener(listener);
      return () => event.removeListener(listener);
    };
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
    contentHeight: async (height) => {
      await bridge.call("appHost.contentHeight", height);
    },
    pageSheet: async (open) => {
      await bridge.call("appHost.pageSheet", open);
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
      onProgress: listen(progress),
    },
    ...(info.googleAuth && { googleAuth: createGoogleAuth(bridge) }),
    onHidden: listen(hidden),
    onVisible: listen(visible),
  };
}
