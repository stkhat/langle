import { NARROW_BY_MARGIN } from "../adapter-kit";
import { fullscreenElement } from "../../fullscreen";
import type { YouTubeLayout } from "./layout";

/** A Short's path and its video id. */
export const SHORTS_PATH = /^\/shorts\/([^/]+)/;

/** The URL shows a Short (`/shorts/<id>`; docs/notes/youtube-shorts.md). */
export const isShortsUrl = (href: string) =>
  SHORTS_PATH.test(new URL(href).pathname);

/** www.youtube.com: the watch page, Shorts, and the full-bleed row in fullscreen. */
export function desktopLayout(
  href: () => string = () => location.href,
): YouTubeLayout {
  const onShorts = () => isShortsUrl(href());
  // The watch page's player can stay in the DOM while a Short shows: go by the URL.
  const player = () =>
    document.getElementById(onShorts() ? "shorts-player" : "movie_player");

  return {
    player,
    heading: () =>
      document
        .querySelector(
          onShorts()
            ? "ytd-shorts yt-shorts-video-title-view-model h1"
            : "ytd-watch-metadata h1",
        )
        ?.textContent?.trim(),
    controlsPoint() {
      if (onShorts()) {
        // The Short's own buttons at the top of the video, before its captions button.
        const right = document.querySelector(
          "ytd-shorts ytd-shorts-player-controls #right-controls",
        );
        if (!right) return null;
        return {
          parent: right,
          before:
            right.querySelector(
              ":scope > #closed-captioning-button-container",
            ) ?? right.firstElementChild,
        };
      }
      const controls = document.querySelector(
        "#movie_player .ytp-right-controls",
      );
      if (!controls) return null;
      // Next to the site's gear, as in mock Main.
      const settings = controls.querySelector(".ytp-settings-button");
      return settings?.parentElement
        ? { parent: settings.parentElement, before: settings }
        : { parent: controls, before: controls.firstElementChild };
    },
    belowVideoElement: () =>
      onShorts() ? null : document.getElementById("below"),
    sideColumn() {
      if (onShorts()) return null;
      const parent = document.getElementById("secondary-inner");
      if (!parent) return null;
      const related = document.getElementById("related");
      return {
        parent,
        before: related?.parentElement === parent ? related : null,
      };
    },
    vertical: onShorts,
    besidePlayer: () =>
      onShorts()
        ? document.querySelector<HTMLElement>(
            "ytd-shorts reel-action-bar-view-model",
          )
        : null,
    /**
     * The player's box in the full-bleed row while the page is in fullscreen (YouTube
     * puts `<html>` in fullscreen; theater mode uses the same row without it). Null
     * elsewhere (docs/notes/youtube-captions.md).
     */
    fullscreenBox() {
      const element = fullscreenElement();
      if (onShorts() || !element) return null;
      const box = document.getElementById("player-full-bleed-container");
      const view = player();
      return box &&
        view &&
        box.contains(view) &&
        !view.contains(element) &&
        element.contains(box)
        ? box
        : null;
    },
    narrow: NARROW_BY_MARGIN,
    // The player's controls are inside it.
    fullscreenLayers: () => [],
    onNavigate(listener) {
      const handler = () => listener();
      document.addEventListener("yt-navigate-finish", handler);
      return () => document.removeEventListener("yt-navigate-finish", handler);
    },
  };
}
