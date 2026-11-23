import type { Bridge } from "../bridge/bridge";
import type { CallApi, EventApi } from "../bridge/protocol";

/**
 * A `Bridge` for the shim's unit tests: records calls, answers them with `answer`,
 * and delivers events to the shim's handlers as native code would.
 */
export function fakeBridge(
  answer: (api: CallApi, args: unknown[]) => unknown = () => undefined,
) {
  const calls: { api: CallApi; args: unknown[] }[] = [];
  const handlers = new Map<EventApi, (args: unknown[]) => unknown>();
  const bridge: Bridge = {
    call: async (api, ...args) => {
      calls.push({ api, args });
      return answer(api, args);
    },
    on: (api, handler) => {
      handlers.set(api, handler);
    },
  };
  return {
    bridge,
    calls,
    /** Delivers an event; resolves with what the shim answers (as for a `replyId`). */
    emit: async (api: EventApi, ...args: unknown[]): Promise<unknown> => {
      const handler = handlers.get(api);
      if (!handler) throw new Error(`nothing handles ${api}`);
      return handler(args);
    },
  };
}
