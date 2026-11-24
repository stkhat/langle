import { NARROW_BY_WIDTH } from "../adapter-kit";
import { fullscreenElement } from "../../fullscreen";
import type { YouTubeLayout } from "./layout";

/**
 * m.youtube.com's watch page (docs/notes/mobile.md "m.youtube.com layout"): the player
 * pinned under the header, YouTube's metadata under it, no side column, no Shorts (not in
 * M3: a `/shorts/` URL shows nothing), no L or ^ on the player (spec mobile-app.md "The
 * watch page on a phone"). In fullscreen YouTube puts the player's container in
 * fullscreen; the player's own box in it is what is narrowed, with the layers beside it
 * that cover the whole screen (the controls, the thumbnail, the ambient glow: measured on
 * the Android WebView, notes "Device checks (M3d)").
 */
export function mobileLayout(): YouTubeLayout {
  const player = () => document.getElementById("movie_player");
  return {
    player,
    heading: () =>
      document
        .querySelector("ytm-slim-video-metadata-section-renderer h2")
        ?.textContent?.trim(),
    controlsPoint: () => null,
    // Where YouTube's metadata starts: the box that holds the watch page's results.
    belowVideoElement: () =>
      document.querySelector(
        "ytm-watch ytm-single-column-watch-next-results-renderer",
      )?.parentElement ?? null,
    sideColumn: () => null,
    vertical: () => false,
    besidePlayer: () => null,
    fullscreenBox() {
      const element = fullscreenElement();
      const box = player()?.parentElement;
      return element && box && element.contains(box) && !box.contains(element)
        ? box
        : null;
    },
    narrow: NARROW_BY_WIDTH,
    fullscreenLayers(box) {
      const screen = box.parentElement?.getBoundingClientRect();
      if (!screen) return [];
      return [...(box.parentElement?.children ?? [])].filter(
        (each): each is HTMLElement => {
          if (each === box || !(each instanceof HTMLElement)) return false;
          if (each.tagName.startsWith("LANGLE-")) return false;
          const rect = each.getBoundingClientRect();
          return rect.width >= screen.width && rect.height >= screen.height;
        },
      );
    },
    onNavigate(listener) {
      // Fired once after the URL changed (yt-navigate-finish is not fired here).
      const handler = () => listener();
      window.addEventListener("state-navigateend", handler);
      return () => window.removeEventListener("state-navigateend", handler);
    },
  };
}
