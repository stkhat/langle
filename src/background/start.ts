import { browser } from "wxt/browser";
import { openLangleDb } from "./db";
import { deviceId } from "./device-id";
import { createHandlers } from "./handlers";
import { createHistoryStore, forgetNeverRunOnHosts } from "./history-store";
import { createLanguageResources } from "./language-resources";
import { createPackDownloads, startPackDownloads } from "./pack-downloads";
import { createPackSource, createPackStore } from "./pack-store";
import { createRecentsStore } from "./recents-store";
import { appHostOf } from "../core/app-host";
import { cloudSettings, getSettings, setSettings } from "./settings-store";
import { watchBuild } from "./self-reload";
import { createSetup } from "./setup";
import { createSetupTab } from "./setup-tab";
import { isCheckLogMessage, startWorkerErrorLog } from "../check/start";
import { createBrowserSyncBackend } from "./sync/browser-sync-backend";
import {
  cloudAccount,
  cloudConnected,
  createCloudSyncBackend,
} from "./sync/cloud-sync-backend";
import { createAppGoogleAuth } from "./sync/app-google-auth";
import { createGoogleAuth } from "./sync/google-auth";
import { googleClients } from "./sync/google-clients";
import { createDriveFiles } from "../core/cloud/google-drive";
import type { CloudProvider, CloudProviderId } from "../core/cloud/provider";
import { createTermStore } from "./term-store";
import { followToolbarIcon } from "./toolbar-icon";
import { createTranslationCache } from "./translation-cache";
import { createExplanationCache } from "./explanation-cache";
import { createPackLoader } from "../core/packs/load";
import { readLock } from "../core/packs/lock";
import { PACK_STATE_KEY } from "../core/packs/state";
import { getSetupStage, watchSetupStage, whenSetUp } from "../messaging/setup";
import { fetchLocale } from "../i18n/ui-locale";
import { watchSettings } from "../messaging/storage";

/**
 * Runs each time the service worker starts. Everything is created again on a restart:
 * the database opens on first use, packs load on the first request that needs them,
 * the chosen pair's packs are brought to their lock version (a download the worker
 * stopped carries on), and sync pulls what other devices wrote while the worker was
 * stopped. Until this device is set up (ui.md "First-run consent") none of that
 * happens: only the setup's own requests are answered.
 */
export function startBackground(): void {
  // `npm run build:check` only: the error log a check reads (src/check/error-log.ts),
  // with the pack mirrors' tries. The mode is a constant at build time, so other
  // builds leave it out.
  const checkLog =
    import.meta.env.MODE === "check" ? startWorkerErrorLog() : undefined;

  const app = appHostOf();
  const device = deviceId();
  const db = openLangleDb("langle", { deviceId: device });
  const store = createTermStore(db, { deviceId: device });
  const history = createHistoryStore(db, { deviceId: device });
  const sync = createBrowserSyncBackend({
    store,
    termsInCloud: () => cloudConnected(),
  });
  const cloud = createCloudSyncBackend({
    db,
    store,
    history,
    settings: cloudSettings(),
    deviceId: device,
    providers: cloudProviders(),
    browserSync: sync,
    // The app's background runs only while the app does (mobile-app.md "M7").
    ...(app && { lifecycle: app }),
  });

  const lock = readLock();
  const models = appHostOf()?.models;
  const packStore = createPackStore({
    db,
    lock,
    setState: (states) =>
      browser.storage.local.set({ [PACK_STATE_KEY]: states }),
    ...(checkLog && { onMirror: checkLog.onMirror }),
    ...(models && { models }),
  });
  const loadPack = createPackLoader(createPackSource(packStore));
  const resources = createLanguageResources(loadPack);
  // A pack whose version switched (or that was removed) is read again when next used.
  packStore.onSwitch((pack) => {
    loadPack.forget(pack);
    resources.forget(pack);
  });
  // Registers its listeners synchronously, so an event that wakes the worker is heard.
  const { retry: retryPacks } = startPackDownloads(
    createPackDownloads({ store: packStore, getSettings }),
  );

  const setupUrl = browser.runtime.getURL("/welcome.html");
  const setup = createSetup({
    pageUrl: setupUrl,
    tab: createSetupTab({
      pageUrl: setupUrl,
      tabs: browser.tabs,
      focusWindow: (id) => browser.windows.update(id, { focused: true }),
      session: {
        get: async () =>
          (await browser.storage.session.get(SETUP_TAB_KEY))[SETUP_TAB_KEY],
        set: (value) => browser.storage.session.set({ [SETUP_TAB_KEY]: value }),
      },
      ...(browser.action.openPopup && {
        openPopup: (options) => browser.action.openPopup(options),
      }),
    }),
    ranBefore: async () => (await db.packVersions.count()) > 0,
  });
  setup.openOnInstall();

  const explanations = createExplanationCache(db);
  const handle = createHandlers({
    store,
    history,
    translations: createTranslationCache(db),
    explanations,
    settings: { get: getSettings, set: setSettings },
    resources,
    packs: { lock, store: packStore, retry: retryPacks },
    sync,
    // Home's Continue and Sites: kept only in the phone app.
    ...(appHostOf() && { recents: createRecentsStore(db) }),
    cloud,
    openOptionsPage: () => browser.runtime.openOptionsPage(),
    loadLocale: fetchLocale,
    // Chrome refuses it at times (no focused window): nothing then.
    openPopup: async () => {
      await browser.action.openPopup?.().catch(() => undefined);
    },
  });

  const answer = setup.guard(handle);

  // Registered synchronously so a message that wakes the worker is not missed.
  // Answering through sendResponse (and returning true) works in every browser;
  // returning a Promise does not in all Chromium versions.
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (import.meta.env.MODE === "check" && isCheckLogMessage(message)) return;
    void answer(message, sender).then(sendResponse);
    return true;
  });

  // Registered synchronously too, so a change that wakes the worker is heard.
  forgetNeverRunOnHosts(history, explanations);

  // Gray while Langle is switched off (the popup header's switch) or not set up.
  followToolbarIcon({
    setIcon: (path) => browser.action.setIcon({ path }),
    getSettings,
    getSetupStage,
    watchSetupStage,
    watchSettings,
    onStartup: browser.runtime.onStartup,
  });

  // Both read what changed while they did not run when they start, so an event that
  // came before they listen is not lost; the worker is woken by the listeners above.
  whenSetUp(() => {
    sync.start().catch((error: unknown) => console.error(error));
    cloud.start().catch((error: unknown) => console.error(error));
  });

  // `npm run build:check` only: reload when a new build is copied in. The mode is a
  // constant at build time, so other builds leave this (and self-reload.ts) out.
  if (import.meta.env.MODE === "check")
    watchBuild().catch((error: unknown) => console.error(error));
}

/** `storage.session`: the setup's tab and the one to go back to. */
const SETUP_TAB_KEY = "setupTab";

/**
 * The cloud providers this build can connect to. Google Drive needs the build's Google
 * client (google-clients.ts); a build without one offers no provider. In the phone app
 * the shell signs in (`appHost.googleAuth`, mobile-app.md "M7"); an app whose shell
 * cannot (no Google Play services) offers none.
 */
function cloudProviders(): Partial<Record<CloudProviderId, CloudProvider>> {
  const app = appHostOf();
  const google = googleClients();
  const auth = app
    ? app.googleAuth && createAppGoogleAuth(app.googleAuth)
    : google &&
      createGoogleAuth({
        webClientId: google.web,
        account: () => cloudAccount(),
      });
  if (!auth) return {};
  return {
    googleDrive: { id: "googleDrive", files: createDriveFiles(), auth },
  };
}
