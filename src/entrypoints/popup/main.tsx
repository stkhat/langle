import { browser } from "wxt/browser";
import { translatorBackend } from "../../content/translate/backend";
import "@fontsource/nunito/latin-600.css";
import "@fontsource/nunito/latin-800.css";
import { createBrowserEnv } from "../../core/browser-env";
import { supportLinks } from "../../core/links";
import { send } from "../../messaging/client";
import { getSetupStage, watchSetupStage } from "../../messaging/setup";
import { watchPackState, watchSettings } from "../../messaging/storage";
import type { PageSummary } from "../../messaging/page-protocol";
import { mountPage } from "../../ui/mount-page";
import { Popup, type PopupDeps } from "./Popup";
import { SetupPending } from "./SetupPending";

// Each step of the setup shows another popup.
watchSetupStage(() => location.reload());
getSetupStage()
  .then((stage) => {
    if (stage === "ready") return mountPage(readyPopup);
    // Nothing of settings, pages or models until this device is set up.
    mountPage(() => ({
      app: (
        <SetupPending
          stage={stage}
          review={() => {
            send({ type: "openSetup" })
              .catch((error: unknown) => console.error(error))
              .finally(() => window.close());
          }}
        />
      ),
    }));
  })
  .catch((error: unknown) => console.error(error));

function readyPopup() {
  // The click that opened the popup, or the first one in it, starts the translator's
  // model downloads for the chosen languages (the setup's click may have had no model
  // to ask for, and browser sync can bring other languages).
  send({ type: "getSettings" }).then(
    ({ learningLang, nativeLang }) =>
      translatorBackend().downloadOnFirstActivation(
        document,
        () => ({ learning: learningLang, native: nativeLang }),
        { now: true },
      ),
    () => {},
  );
  const env = createBrowserEnv();
  const deps: PopupDeps = {
    send,
    // Content scripts answer by tab; `tabs.sendMessage` needs no permission.
    async askPage(request) {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.id === undefined) return undefined;
      try {
        const reply = (await browser.tabs.sendMessage(tab.id, request)) as
          PageSummary | undefined;
        return reply ?? undefined;
      } catch {
        // No content script there (browser pages, the store, PDFs).
        return undefined;
      }
    },
    watchSettings,
    watchPackState,
    syncName: env.syncName,
    links: supportLinks(env.reviewUrl),
    openTab(url) {
      void browser.tabs.create({ url }).finally(() => window.close());
    },
    openOptions() {
      void browser.runtime.openOptionsPage().finally(() => window.close());
    },
    openWordList() {
      void browser.tabs
        .create({
          url: browser.runtime.getURL("/wordlist.html" as "/popup.html"),
        })
        .finally(() => window.close());
    },
    close: () => window.close(),
    now: Date.now,
    refreshMs: 1000,
  };
  return { theme: deps, app: <Popup deps={deps} /> };
}
