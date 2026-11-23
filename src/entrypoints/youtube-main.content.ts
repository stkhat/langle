import { installYouTubeHooks } from "../content/video/youtube/page";

/** youtube.com's own world: watches the player's caption requests. */
export default defineContentScript({
  matches: ["*://www.youtube.com/*"],
  // The phone app gets m.youtube.com scripts of its own (mobile-app.md "Build order").
  exclude: ["langle-app"],
  world: "MAIN",
  runAt: "document_start",
  main() {
    installYouTubeHooks();
  },
});
