import type { Bridge } from "../bridge/bridge";
import { createAlarms } from "./alarms";
import { createAppHost } from "./app-host";
import { createAction, createI18n, createWindows } from "./misc";
import { createRuntime, type AppInfo } from "./runtime";
import { createStorage } from "./storage";
import { createTabs } from "./tabs";

/**
 * Builds the app's `browser` over the bridge and sets it as `globalThis.browser` and
 * `globalThis.chrome`, and the app's own `appHost` (`core/app-host.ts`) as
 * `globalThis.appHost`, so `wxt/browser` (which takes `browser` when it has a
 * `runtime.id`) and the extension's code use it unchanged. Only what Langle calls is
 * there; anything else (`identity`, `offscreen`, …) is left undefined, so feature
 * detection hides what needs it (docs/specs/mobile-app.md "Shim surface").
 */
export function installShim(bridge: Bridge, info: AppInfo) {
  const shim = {
    runtime: createRuntime(bridge, info),
    storage: createStorage(bridge),
    tabs: createTabs(bridge),
    alarms: createAlarms(bridge),
    windows: createWindows(),
    action: createAction(bridge),
    i18n: createI18n(),
  };
  const globals = globalThis as {
    browser?: unknown;
    chrome?: unknown;
    appHost?: unknown;
  };
  globals.browser = shim;
  globals.chrome = shim;
  globals.appHost = createAppHost(bridge, info.translator);
  return shim;
}
