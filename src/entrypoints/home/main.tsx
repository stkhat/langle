import { appHostOf } from "../../core/app-host";
import { createBrowserEnv } from "../../core/browser-env";
import { send } from "../../messaging/client";
import { getSetupStage, watchSetupStage } from "../../messaging/setup";
import { watchPackState, watchSettings } from "../../messaging/storage";
import { mountPage } from "../../ui/mount-page";
import { color } from "../../ui/styles";
import { Home, type HomeDeps } from "./Home";

/** The phone app's Home (`langle-app` builds only): the app's first screen. */
const warn = (error: unknown) => console.warn("Langle:", error);

// Each step of the setup shows another Home.
watchSetupStage(() => location.reload());
getSetupStage()
  .then((stage) => {
    const deps: HomeDeps = {
      send,
      watchSettings,
      watchPackState,
      openPage(url) {
        appHostOf()?.openPage(url).catch(warn);
      },
      openSetup() {
        send({ type: "openSetup" }).catch(warn);
      },
      googleAuth: createBrowserEnv().features.appGoogleAuth,
      now: Date.now,
      refreshMs: 5000,
    };
    document.documentElement.style.background = color.surface;
    mountPage(() => ({
      // Before the setup no settings are read: the page follows the system's theme.
      ...(stage === "ready" && { theme: deps }),
      app: <Home deps={deps} stage={stage} />,
    }));
  })
  .catch(warn);
