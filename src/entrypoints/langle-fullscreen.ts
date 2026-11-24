import {
  APP_FULLSCREEN_NAMES,
  installAppFullscreen,
} from "../app/fullscreen/app-fullscreen";

/**
 * The phone app's own fullscreen (docs/plans/mobile-app.md "M3e"): the iOS shell
 * injects it in the page's world of every browsing page at document start. It installs
 * itself only where the page has no element fullscreen. The extension builds leave it out.
 */
export default defineUnlistedScript({
  include: ["langle-app"],
  main() {
    installAppFullscreen(APP_FULLSCREEN_NAMES);
  },
});
