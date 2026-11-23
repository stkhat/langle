import { startShim } from "../app/start-shim";

/**
 * The phone app's `browser` (docs/specs/mobile-app.md "Shim surface"): native code
 * injects it before Langle's scripts in every context (content scripts, the extension
 * host, the app's pages). The extension builds leave it out.
 */
export default defineUnlistedScript({
  include: ["langle-app"],
  main() {
    startShim();
  },
});
