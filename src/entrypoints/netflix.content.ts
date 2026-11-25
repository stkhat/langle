import { startContentCheck } from "../check/start";
import { createNetflixAdapter } from "../content/video/netflix/adapter";
import { runWhenSetUp } from "../content/setup";
import { inUiLocale } from "../content/ui-locale";
import { tellPage } from "../content/video/page-channel";
import { CHANNEL } from "../content/video/netflix/messages";
import { runVideoSite } from "../content/video/run";

export default defineContentScript({
  matches: ["*://www.netflix.com/*"],
  // The phone app has no Netflix (docs/specs/mobile-app.md).
  exclude: ["langle-app"],
  // Early, to hear about the first manifest the player parses.
  runAt: "document_start",
  main(ctx) {
    // `npm run build:check` only: the error log and the settings channel (src/check/).
    if (import.meta.env.MODE === "check") startContentCheck("netflix");
    runWhenSetUp(
      ctx,
      inUiLocale(ctx, () => runVideoSite(ctx, createNetflixAdapter())),
      {
        needsPageLoad: true,
        waiting: () => tellPage(CHANNEL, "wait"),
      },
    );
  },
});
