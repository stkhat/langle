import { tlangRefused } from "../check/refuse-tlang";
import { startContentCheck } from "../check/start";
import { runWhenSetUp } from "../content/setup";
import { inUiLocale } from "../content/ui-locale";
import { tellPage } from "../content/video/page-channel";
import { CHANNEL } from "../content/video/youtube/messages";
import { runVideoSite } from "../content/video/run";
import { createYouTubeAdapter } from "../content/video/youtube/adapter";
import { mobileLayout } from "../content/video/youtube/mobile-layout";

/**
 * m.youtube.com in every build (the phone app, and desktop or Android browsers that get
 * the mobile site): the video part only, on the mobile layout (spec mobile-app.md
 * "The adapter"). No comments: they are not in M3.
 */
export default defineContentScript({
  matches: ["*://m.youtube.com/*"],
  // Early, to see the player's first caption request.
  runAt: "document_start",
  main(ctx) {
    // `npm run build:check` only: the error log and the settings channel (src/check/).
    if (import.meta.env.MODE === "check") startContentCheck("youtube-mobile");
    runWhenSetUp(
      ctx,
      inUiLocale(ctx, () =>
        runVideoSite(
          ctx,
          createYouTubeAdapter({
            layout: mobileLayout(),
            // `npm run build:check` only (src/check/refuse-tlang.ts).
            ...(import.meta.env.MODE === "check" && {
              refuseTlang: tlangRefused,
            }),
          }),
        ),
      ),
      { needsPageLoad: true, waiting: () => tellPage(CHANNEL, "wait") },
    );
  },
});
