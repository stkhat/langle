import type { Narrowing } from "../adapter-kit";
import type { InsertionPoint } from "../platform";

/**
 * The structure of one kind of YouTube page (spec mobile-app.md "The adapter"): where
 * the player, the title and Langle's insertion points are, the box narrowed in
 * fullscreen, and the navigation signal. `createYouTubeAdapter` does the rest (captions,
 * playback, the video id) the same way on every layout: `desktopLayout` for
 * www.youtube.com, `mobileLayout` for m.youtube.com.
 */
export interface YouTubeLayout {
  /** The current page's player, or null. */
  player(): HTMLElement | null;
  /** The video's heading; the adapter falls back to `document.title`. */
  heading(): string | undefined;
  /** Where the L and ^ buttons go in the player's controls; null where there are none. */
  controlsPoint(): InsertionPoint | null;
  /** The area under the player (subtitle position "Below video"). */
  belowVideoElement(): HTMLElement | null;
  /** Where the transcript goes in the side column, or null without one. */
  sideColumn(): InsertionPoint | null;
  /**
   * The page shows a Short (`/shorts/<id>`): a vertical video, whose id the adapter
   * reads from the path and whose player the page script calls. Always false where
   * Shorts are not supported.
   */
  vertical(): boolean;
  /** What the dictionary window goes to the right of, beside a vertical video. */
  besidePlayer(): HTMLElement | null;
  /** The box in fullscreen that can be narrowed, or null outside fullscreen. */
  fullscreenBox(): HTMLElement | null;
  /** How `narrowPlayer` narrows `fullscreenBox()` by `width` px at a side. */
  readonly narrow: Narrowing;
  /** The site's layers over `fullscreenBox()` but outside it, narrowed with it. */
  fullscreenLayers(box: HTMLElement): HTMLElement[];
  /** Calls `listener` after an in-page navigation; returns an unsubscribe. */
  onNavigate(listener: () => void): () => void;
}
