import { installYouTubeHooks } from "../content/video/youtube/page";

/** m.youtube.com's own world, in every build: watches the player's caption requests. */
export default defineContentScript({
  matches: ["*://m.youtube.com/*"],
  world: "MAIN",
  runAt: "document_start",
  main() {
    installYouTubeHooks();
  },
});
