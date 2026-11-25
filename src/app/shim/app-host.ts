import type { AppHost } from "../../core/app-host";
import type { Bridge } from "../bridge/bridge";

/** The app's `appHost` over the bridge: each method is a call the shells answer. */
export function createAppHost(bridge: Bridge): AppHost {
  return {
    openPage: async (url) => {
      await bridge.call("appHost.openPage", url);
    },
    shareFile: async ({ name, mime, text }) => {
      await bridge.call("appHost.shareFile", { name, mime, text });
    },
  };
}
