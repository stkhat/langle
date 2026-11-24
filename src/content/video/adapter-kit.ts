import { primary } from "../../core/languages";
import {
  chooseTranslation,
  type TranslationChoice,
} from "../../core/subtitles/translation";
import type { Cue, Track } from "../../core/subtitles/types";
import type { CaptionRequest, VideoCaptions } from "./platform";
import { abortError } from "./recent";

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(abortError(signal!));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Adds or removes a style element of Langle's (hiding the site's captions or control bar). */
export function styleSwitch(id: string, css: string) {
  return (hidden: boolean) => {
    const existing = document.getElementById(id);
    if (!hidden) existing?.remove();
    if (!hidden || existing) return;
    // textContent, not innerHTML: youtube.com enforces Trusted Types.
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    (document.head ?? document.documentElement).append(style);
  };
}

/**
 * The first track in this order: `preferred` ones before the others, and within each,
 * the exact language before another region of it (`en-GB` for `en`).
 */
export function pickTrack<T extends { lang: string }>(
  tracks: readonly T[],
  lang: string,
  preferred: (track: T) => boolean,
): T | undefined {
  const exact = (t: T) => t.lang.toLowerCase() === lang.toLowerCase();
  const sameLanguage = (t: T) => primary(t.lang) === primary(lang);
  const order = [
    (t: T) => preferred(t) && exact(t),
    (t: T) => preferred(t) && sameLanguage(t),
    exact,
    sameLanguage,
  ];
  for (const matches of order) {
    const track = tracks.find(matches);
    if (track) return track;
  }
  return undefined;
}

type SiteChoice = Extract<
  TranslationChoice,
  { source: "siteTrack" | "siteAutoTranslate" }
>;

/**
 * The first source in the spec's order ("Choosing a translation") that has cues: a
 * site track or auto-translation that gives none is dropped and the next one tried.
 */
export async function firstTranslation(
  request: CaptionRequest,
  sources: { tracks: Track[]; canAutoTranslate: boolean },
  cuesOf: (choice: SiteChoice) => Promise<Cue[]>,
): Promise<VideoCaptions["translation"]> {
  let { tracks, canAutoTranslate } = sources;
  const lang = request.nativeLang;
  for (;;) {
    request.signal?.throwIfAborted();
    const choice = chooseTranslation({
      tracks,
      nativeLang: lang,
      canAutoTranslate,
      translatorAvailable: request.translatorAvailable,
    });
    if (choice.source === "builtIn" || choice.source === "none")
      return { source: choice.source, lang, cues: [] };
    const cues = await cuesOf(choice);
    if (cues.length > 0) return { source: choice.source, lang, cues };
    if (choice.source === "siteTrack")
      tracks = tracks.filter((t) => t !== choice.track);
    else canAutoTranslate = false;
  }
}

/** The side of the player the room is made at. */
export type NarrowSide = "left" | "right";

/** How a box is narrowed by `width` px at `side`: the inline styles it gets. */
export type Narrowing = (
  width: number,
  side: NarrowSide,
) => Record<string, string>;

/** A box as wide as its container: a width narrows it, a margin moves it right. */
export const NARROW_BY_WIDTH: Narrowing = (width, side) => ({
  width: `calc(100% - ${width}px)`,
  ...(side === "left" && { "margin-left": `${width}px` }),
});

/** A growing flex item (a width has no effect): a margin narrows it. */
export const NARROW_BY_MARGIN: Narrowing = (width, side) => ({
  [`margin-${side}`]: `${width}px`,
});

/** A site's player sizes its video again within this long after the `resize` (ms). */
const RELAYOUT_WAIT = 400;

/**
 * `PlatformAdapter.narrowPlayer` for a site: sets the styles `narrowing` gives on the
 * element `target` finds (inline, `!important`) and tells the site with a window
 * `resize`, on which its player sizes the `<video>` again (docs/notes/netflix.md,
 * youtube-captions.md). A player that does not (m.youtube.com, docs/notes/mobile.md)
 * still has its video outside the narrowed box a moment later: the video is then
 * fitted into the box (`fitVideo`). Width 0 gives the element its own values back.
 * Asked again with the same element, width and side it does nothing, so it can run on
 * every change to the page; an element the site rendered again gets the values, the
 * old one its own back.
 */
export function playerNarrower(
  target: () => HTMLElement | null,
  narrowing: Narrowing,
): (width: number, side?: NarrowSide) => void {
  let narrowed: {
    element: HTMLElement;
    width: number;
    side: NarrowSide;
    own: Record<string, { value: string; priority: string }>;
    unfit: () => void;
  } | null = null;

  function restore() {
    if (!narrowed) return;
    const { element, own, unfit } = narrowed;
    unfit();
    for (const [property, { value, priority }] of Object.entries(own))
      if (value) element.style.setProperty(property, value, priority);
      else element.style.removeProperty(property);
    narrowed = null;
  }

  return (width, side = "right") => {
    const element = width > 0 ? target() : null;
    if (
      narrowed?.element === element &&
      narrowed?.width === width &&
      narrowed?.side === side
    )
      return;
    const changed = narrowed !== null || element !== null;
    restore();
    if (element) {
      const styles = narrowing(width, side);
      const own = Object.fromEntries(
        Object.keys(styles).map((property) => [
          property,
          {
            value: element.style.getPropertyValue(property),
            priority: element.style.getPropertyPriority(property),
          },
        ]),
      );
      for (const [property, value] of Object.entries(styles))
        element.style.setProperty(property, value, "important");
      narrowed = { element, width, side, own, unfit: fitVideo(element) };
    }
    if (changed) window.dispatchEvent(new Event("resize"));
  };
}

/** The styles `fitVideo` sets on a video. */
const FIT = ["left", "top", "width", "height", "object-fit"] as const;

/**
 * Keeps the largest video in `box` inside it, for a player that does not size its
 * video for a narrowed box: once the site has had its time to lay the video out again,
 * a video still reaching outside the box is set to the box's size (letterboxed:
 * `object-fit: contain`) and moved onto it. It is fitted again while the box changes
 * size or the site writes the video's style. Returns an undo that gives the video its
 * own styles back.
 */
function fitVideo(box: HTMLElement): () => void {
  let video: HTMLVideoElement | null = null;
  let own: Record<string, { value: string; priority: string }> = {};
  let fitted = false;
  // The site writing the fitted video's style (its own layout) fits it again.
  const restyled = new MutationObserver(() => {
    if (fitted) fit();
  });

  function largestVideo() {
    let best: HTMLVideoElement | null = null;
    let area = 0;
    for (const each of box.querySelectorAll("video")) {
      const rect = each.getBoundingClientRect();
      if (rect.width * rect.height > area) {
        best = each;
        area = rect.width * rect.height;
      }
    }
    return best;
  }

  function unfit() {
    if (!video || !fitted) return;
    for (const property of FIT) {
      const { value = "", priority = "" } = own[property] ?? {};
      if (value) video.style.setProperty(property, value, priority);
      else video.style.removeProperty(property);
    }
    fitted = false;
  }

  function fit() {
    const area = box.getBoundingClientRect();
    if (!fitted) {
      video = largestVideo();
      if (!video) return;
      const rect = video.getBoundingClientRect();
      const inside =
        rect.left >= area.left - 1 &&
        rect.right <= area.right + 1 &&
        rect.top >= area.top - 1 &&
        rect.bottom <= area.bottom + 1;
      if (inside) return;
      own = Object.fromEntries(
        FIT.map((property) => [
          property,
          {
            value: video!.style.getPropertyValue(property),
            priority: video!.style.getPropertyPriority(property),
          },
        ]),
      );
      fitted = true;
      restyled.observe(video, { attributes: true, attributeFilter: ["style"] });
    }
    if (!video) return;
    const style = getComputedStyle(video);
    const rect = video.getBoundingClientRect();
    // Its offsets now, moved by how far it is from the box (static: none to move).
    const left = (Number.parseFloat(style.left) || 0) + area.left - rect.left;
    const top = (Number.parseFloat(style.top) || 0) + area.top - rect.top;
    const wanted: Record<(typeof FIT)[number], string> = {
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      width: `${Math.round(area.width)}px`,
      height: `${Math.round(area.height)}px`,
      "object-fit": "contain",
    };
    for (const property of FIT)
      if (
        video.style.getPropertyValue(property) !== wanted[property] ||
        video.style.getPropertyPriority(property) !== "important"
      )
        video.style.setProperty(property, wanted[property], "important");
  }

  const timer = setTimeout(fit, RELAYOUT_WAIT);
  const resized = new ResizeObserver(() => {
    if (fitted) fit();
  });
  resized.observe(box);
  return () => {
    clearTimeout(timer);
    resized.disconnect();
    restyled.disconnect();
    unfit();
  };
}
