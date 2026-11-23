import { startContentCheck } from "../check/start";
import { runWhenSetUp } from "../content/setup";
import { tellPage } from "../content/video/page-channel";
import { CHANNEL } from "../content/video/youtube/messages";
import { runVideoSite } from "../content/video/run";
import { createYouTubeAdapter } from "../content/video/youtube/adapter";
import { runYouTubeComments } from "../content/video/youtube/comments";
import { startYouTubeParts } from "../content/video/youtube/parts";

export default defineContentScript({
  matches: ["*://www.youtube.com/*"],
  // Early, to see the player's first caption request.
  runAt: "document_start",
  main(ctx) {
    // `npm run build:check` only: the error log and the settings channel (src/check/).
    if (import.meta.env.MODE === "check") startContentCheck("youtube");
    runWhenSetUp(
      ctx,
      () => {
        const adapter = createYouTubeAdapter();
        return startYouTubeParts(
          (hooks) => runYouTubeComments(ctx, adapter, hooks),
          (hooks) => runVideoSite(ctx, adapter, hooks),
        );
      },
      { needsPageLoad: true, waiting: () => tellPage(CHANNEL, "wait") },
    );
  },
});
