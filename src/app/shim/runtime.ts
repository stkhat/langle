import type { AppTranslator } from "../../core/app-host";
import { NO_RECEIVER, type Bridge } from "../bridge/bridge";
import { createEvent } from "./events";

/** What native code tells the shim about the app (`__langleAppInfo`, plus the id). */
export interface AppInfo {
  id: string;
  /** The app origin the build is served from (docs/specs/mobile-app.md "Contexts"). */
  origin: string;
  manifest: Record<string, unknown>;
  /** How the app's translator gets its models (`appHost.translator`); none without a host. */
  translator?: AppTranslator;
  /** Whether the shell can sign in to Google (`appHost.googleAuth`). */
  googleAuth?: boolean;
}

type SendResponse = (response?: unknown) => void;
type MessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: SendResponse,
) => unknown;

/** `browser.runtime` over the bridge. */
export function createRuntime(bridge: Bridge, info: AppInfo) {
  const onMessage = createEvent<Parameters<MessageListener>>();
  const onInstalled = createEvent<[unknown]>();
  const onStartup = createEvent<[]>();

  bridge.on("runtime.onMessage", ([message, sender]) =>
    answerMessage(onMessage.emit, message, sender),
  );
  bridge.on("runtime.onInstalled", ([details]) => {
    onInstalled.emit(details);
  });
  bridge.on("runtime.onStartup", () => {
    onStartup.emit();
  });

  const base = info.origin.replace(/\/+$/, "");
  return {
    id: info.id,
    getURL: (path: string) => `${base}/${path.replace(/^\/+/, "")}`,
    getManifest: () => info.manifest,
    sendMessage: (message: unknown) =>
      bridge.call("runtime.sendMessage", message),
    openOptionsPage: async (): Promise<void> => {
      await bridge.call("runtime.openOptionsPage");
    },
    reload: (): void => {
      void bridge.call("runtime.reload");
    },
    onMessage,
    onInstalled,
    onStartup,
  };
}

/**
 * Calls the listeners as the browsers do and settles with the answer: the first
 * `sendResponse`, or the first Promise a listener returns. A listener that returns
 * `true` will call `sendResponse` later. When nobody answers, the sender gets Chrome's
 * "Receiving end does not exist" (`messaging/client.ts` retries on it).
 */
function answerMessage(
  emit: (...args: Parameters<MessageListener>) => unknown[],
  message: unknown,
  sender: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      finish();
    };
    const sendResponse: SendResponse = (response) =>
      settle(() => resolve(response));
    const results = emit(message, sender, sendResponse);
    let waiting = false;
    for (const result of results) {
      if (result === true) waiting = true;
      else if (isThenable(result)) {
        // Not `instanceof Promise`: a listener may come from another realm.
        waiting = true;
        result.then(sendResponse, (error: unknown) =>
          settle(() => reject(error)),
        );
      }
    }
    if (!waiting) settle(() => reject(new Error(NO_RECEIVER)));
  });
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
