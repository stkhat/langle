import { browser } from "wxt/browser";
import { googleClients } from "../../background/sync/google-clients";
import { startTranslationModels } from "../../content/translate/translator";
import { createBrowserEnv } from "../../core/browser-env";
import { PRIVACY_POLICY_URL } from "../../core/links";
import { send } from "../../messaging/client";
import { isSetupPing } from "../../messaging/page-protocol";
import { watchSettings } from "../../messaging/storage";
import { mountPage } from "../../ui/mount-page";
import { Welcome, type WelcomeDeps } from "./Welcome";

/** Start does not wait longer for a translator that does not say what it has. */
const MODELS_WAIT_MS = 3000;

// "Is the setup still in this tab?", before it is shown again (background/setup-tab.ts).
browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isSetupPing(message)) return;
  sendResponse(true);
  return true;
});

mountPage(() => {
  const deps: WelcomeDeps = {
    send,
    watchSettings,
    uiLanguage: browser.i18n.getUILanguage(),
    syncName: createBrowserEnv().syncName,
    drive: googleClients() !== undefined,
    privacyPolicy: PRIVACY_POLICY_URL,
    startModels: (learning, native) =>
      Promise.race([
        startTranslationModels(learning, native).then(() => {}),
        new Promise<void>((resolve) => setTimeout(resolve, MODELS_WAIT_MS)),
      ]),
    close() {
      browser.tabs
        .getCurrent()
        .then((tab) =>
          tab?.id === undefined ? undefined : browser.tabs.remove(tab.id),
        )
        .catch((error: unknown) => console.error(error));
    },
    alreadySetUp: () => location.replace("/options.html"),
  };
  // No theme from the settings: they are not read before the consent.
  return { app: <Welcome deps={deps} /> };
});
