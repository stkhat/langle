import type { Bridge } from "../bridge/bridge";

/**
 * `browser.tabs` over the bridge. The tabs are the app's pages; native code takes
 * Chrome's arguments as they are and answers as Chrome would (docs/specs/mobile-app.md
 * "Shim surface").
 */
export function createTabs(bridge: Bridge) {
  return {
    query: (query: unknown) => bridge.call("tabs.query", query),
    get: (tabId: number) => bridge.call("tabs.get", tabId),
    create: (properties: unknown) => bridge.call("tabs.create", properties),
    update: (...args: unknown[]) => bridge.call("tabs.update", ...args),
    remove: (tabIds: number | number[]) => bridge.call("tabs.remove", tabIds),
    reload: (...args: unknown[]) => bridge.call("tabs.reload", ...args),
    /** Like `runtime.sendMessage`, to that tab's content script. */
    sendMessage: (...args: unknown[]) =>
      bridge.call("tabs.sendMessage", ...args),
  };
}
