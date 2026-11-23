import { createBridge } from "./bridge/bridge";
import { nativeTransport } from "./bridge/native-transport";
import { installShim } from "./shim/install";

/**
 * What native code sets in Langle's world just before it injects `langle-shim.js`
 * (docs/specs/mobile-app.md "Contexts"): the app origin, the build's manifest, and
 * which context this is (`host`, `content` or `page`).
 */
interface LangleAppInfo {
  origin: string;
  manifest: Record<string, unknown>;
  context: string;
}

/** The id the extension's code sees as `browser.runtime.id`. */
const APP_ID = "langle-app";

/**
 * Runs first in every Langle context of the app: installs `browser` over the native
 * bridge synchronously, so the scripts after it run unchanged, and says hello once
 * they have run (after DOMContentLoaded, or in the next task when the document is
 * already parsed), so native code sends events only to registered listeners.
 */
export function startShim(): void {
  const transport = nativeTransport();
  const info = (globalThis as { __langleAppInfo?: LangleAppInfo })
    .__langleAppInfo;
  if (!transport || !info) {
    console.error("Langle: no app bridge in this context");
    return;
  }
  const bridge = createBridge(transport);
  installShim(bridge, {
    id: APP_ID,
    origin: info.origin,
    manifest: info.manifest,
  });
  const hello = () => {
    bridge
      .call("bridge.hello", { context: info.context })
      .catch((error: unknown) => console.error(error));
  };
  if (typeof document !== "undefined" && document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", hello, { once: true });
  else setTimeout(hello, 0);
}
