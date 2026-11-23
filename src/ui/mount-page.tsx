import "@fontsource-variable/inter";
import { render, type VNode } from "preact";
import { startPageErrorLog } from "../check/start";
import { getSetupStage } from "../messaging/setup";
import { followTheme } from "./page-theme";

/** Without `theme` the page follows the browser's. */
type Page = () => { theme?: Parameters<typeof followTheme>[0]; app: VNode };

/**
 * Starts an extension page (popup, settings, word list): the error log on a check build,
 * then `page()` makes its parts, then the theme, the body margin, and the page itself
 * rendered into `#app`.
 */
export function mountPage(page: Page): void {
  // `npm run build:check` only (src/check/error-log.ts).
  if (import.meta.env.MODE === "check") startPageErrorLog();
  const { theme, app } = page();
  followTheme(theme);
  document.body.style.margin = "0";
  render(app, document.getElementById("app")!);
}

/** Settings and the word list: until this device is set up they lead to the setup. */
export function mountSetUpPage(page: Page): void {
  getSetupStage()
    .then((stage) => {
      if (stage === "ready") mountPage(page);
      else location.replace("/welcome.html");
    })
    .catch((error: unknown) => console.error(error));
}
