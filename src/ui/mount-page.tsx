import "@fontsource-variable/inter";
import { render, type VNode } from "preact";
import { browser } from "wxt/browser";
import { startPageErrorLog } from "../check/start";
import {
  fetchLocale,
  followUiLocale,
  localeOfTag,
  showUiLocale,
} from "../i18n/ui-locale";
import { getSetupStage } from "../messaging/setup";
import { followDocumentLocale, PageLocale } from "./locale-root";
import { followTheme } from "./page-theme";

type ThemeDeps = Parameters<typeof followTheme>[0];

/**
 * Without `theme` the page follows the browser's theme and language: no settings are
 * read before the setup ends.
 */
type Page = () => { theme?: ThemeDeps; app: VNode };

/** The interface language a page starts in: the settings' one, else the browser's. */
function startLocale(theme: ThemeDeps): Promise<unknown> {
  if (!theme)
    return showUiLocale(localeOfTag(browser.i18n.getUILanguage()), fetchLocale);
  return followUiLocale({
    getSettings: () => theme.send({ type: "getSettings" }),
    watchSettings: theme.watchSettings,
    load: fetchLocale,
  });
}

/**
 * Starts an extension page (popup, settings, word list): the error log on a check build,
 * then `page()` makes its parts, then the theme, the body margin and, once the interface
 * language is there, the page itself rendered into `#app` (again on each change of it).
 */
export function mountPage(page: Page): void {
  // `npm run build:check` only (src/check/error-log.ts).
  if (import.meta.env.MODE === "check") startPageErrorLog();
  const { theme, app } = page();
  followTheme(theme);
  document.body.style.margin = "0";
  void startLocale(theme).then(() => {
    followDocumentLocale();
    render(<PageLocale app={app} />, document.getElementById("app")!);
  });
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
