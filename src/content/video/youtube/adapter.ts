import type { Track } from "../../../core/subtitles/types";
import {
  parseYouTubeJson3,
  youtubeCaptionInfo,
  type YouTubeCaptionInfo,
  type YouTubeTrack,
} from "../../../core/subtitles/youtube-json3";
import { isAbortError } from "../../abort";
import {
  firstTranslation,
  playerNarrower,
  styleSwitch,
  sleep,
} from "../adapter-kit";
import {
  createPageBridge,
  NETWORK_CALL_TIMEOUT_MS,
  retryNetworkCall,
} from "../page-channel";
import { createRecent } from "../recent";
import type {
  CaptionRequest,
  PlatformAdapter,
  VideoCaptions,
} from "../platform";
import {
  CHANNEL,
  isTimedtextMessage,
  type PageCall,
  type PageCallResults,
  type TimedtextMessage,
} from "./messages";
import {
  autoTranslateCode,
  pickOriginalTrack,
  sameResponse,
  trackUrl,
} from "./timedtext";
import { desktopLayout, SHORTS_PATH } from "./desktop-layout";
import type { YouTubeLayout } from "./layout";

export interface YouTubeAdapterOptions {
  /** Default: `location.href`. */
  href?: () => string;
  /** The page's structure. Default: `desktopLayout(href)` (www.youtube.com). */
  layout?: YouTubeLayout;
  /** How long to wait for the player's own caption request before asking for one. */
  playerRequestWaitMs?: number;
  /** How long to wait for the player's request after asking for a track. */
  captureTimeoutMs?: number;
  /** How long the player may take to list its caption tracks (ads not counted). */
  tracksListedTimeoutMs?: number;
  /** How long to wait for one fetch of a track through the page script. */
  fetchTimeoutMs?: number;
  /** How long to wait for the page script's answer to any other call. */
  callTimeoutMs?: number;
  pollMs?: number;
  /**
   * Check builds only (`langle:check-settings` `refuseTlang`): treats YouTube's
   * auto-translation (`tlang`) as refused, as a 429 answer is, so videos show the
   * on-device translation.
   */
  refuseTlang?: () => boolean | Promise<boolean>;
}

/** How long to wait for the player response of the current video. */
const PLAYER_RESPONSE_TIMEOUT_MS = 30_000;
/** Videos whose last captured request is kept (the current one and a few before). */
const KEEP_CAPTURES = 4;
/** How many times the player is asked again after an ad kept it from answering. */
const AD_TRIES = 3;
/**
 * How long the player may take to list the video's caption tracks, ads not counted,
 * before it is asked anyway. A busy page took over 10 s (docs/notes/mobile.md
 * "Subtitles missing on an early load (M5f)").
 */
const TRACKS_LISTED_TIMEOUT_MS = 60_000;
/** `askPlayer`'s answer while the player lists no caption tracks: nothing was asked. */
const UNLISTED = Symbol("unlisted");
/** A try of `loadCaptions` to make again (see `loadFrom`). */
const AGAIN = Symbol("again");

/** The YouTube track `chooseTranslation` picked (it hands back one of `info.tracks`). */
function siteTrack(info: YouTubeCaptionInfo, track: Track): YouTubeTrack {
  const found = info.tracks.find((t) => t.id === track.id);
  if (!found) throw new Error(`Unknown track ${track.id}`);
  return found;
}

/**
 * YouTube's watch page and Shorts, on the page structure `options.layout` reads
 * (www.youtube.com or m.youtube.com). Captions come from the player's own /api/timedtext
 * request, observed by the page script (`page.ts`): its URL carries the PO token the
 * server requires, so the other tracks are fetched by editing that URL. Caption bodies
 * and URLs live in memory only.
 */
export function createYouTubeAdapter(
  options: YouTubeAdapterOptions = {},
): PlatformAdapter {
  const href = options.href ?? (() => location.href);
  const pollMs = options.pollMs ?? 250;
  const playerRequestWaitMs = options.playerRequestWaitMs ?? 1500;
  const captureTimeoutMs = options.captureTimeoutMs ?? 10_000;
  const tracksListedTimeoutMs =
    options.tracksListedTimeoutMs ?? TRACKS_LISTED_TIMEOUT_MS;
  const fetchTimeoutMs = options.fetchTimeoutMs ?? NETWORK_CALL_TIMEOUT_MS;
  const layout = options.layout ?? desktopLayout(href);
  const bridge = createPageBridge<PageCall, PageCallResults, TimedtextMessage>({
    channel: CHANNEL,
    isEvent: isTimedtextMessage,
    ...(options.callTimeoutMs !== undefined && {
      timeoutMs: options.callTimeoutMs,
    }),
  });
  // The site's caption window, and the caption track the browser draws in the video
  // itself (YouTube turns one on when its video is in fullscreen on an iPhone, for the
  // system's player: docs/notes/mobile.md "The app's own fullscreen (M3e)"). Separate
  // rules: a browser that does not know the pseudo-element drops only its rule.
  const hideCaptions = styleSwitch(
    "langle-hide-site-captions",
    "#ytp-caption-window-container { display: none !important; }\n" +
      ".html5-video-player video::-webkit-media-text-track-container { display: none !important; }",
  );
  const cleanups: (() => void)[] = [];

  const onShorts = () => layout.vertical();

  function videoId(): string | undefined {
    const url = new URL(href());
    if (url.pathname === "/watch")
      return url.searchParams.get("v") || undefined;
    return onShorts() ? SHORTS_PATH.exec(url.pathname)?.[1] : undefined;
  }

  const player = () => layout.player();
  const narrowPlayer = playerNarrower(
    () => layout.fullscreenBox(),
    layout.narrow,
    (box) => layout.fullscreenLayers(box),
  );
  cleanups.push(() => narrowPlayer(0));

  const captures = createRecent<TimedtextMessage>(KEEP_CAPTURES);
  const offTimedtext = bridge.onEvent((message) => {
    // Ads make their own requests: they are kept under their own video id.
    if (message.videoId && message.body.trim() !== "")
      captures.set(message.videoId, message);
  });
  cleanups.push(offTimedtext, () => captures.clear());
  const adShowing = () => player()?.classList.contains("ad-showing") ?? false;
  /** Sends a call to the page script, for the player this page shows. */
  const call = <T extends PageCall["type"]>(
    message: Extract<PageCall, { type: T }>,
    timeoutMs?: number,
  ): Promise<PageCallResults[T]> =>
    bridge.call<T>({ ...message, shorts: onShorts() }, timeoutMs);

  /** Fetches a track's body through the page script, trying once more if that fails. */
  const fetchTimedtext = (url: string): Promise<string> =>
    retryNetworkCall(() =>
      call({ type: "fetchTimedtext", url }, fetchTimeoutMs),
    );

  /**
   * The player response once it is the current video's (it lags behind SPA navigation).
   * A call the page leaves unanswered is asked again until the deadline: a page still
   * loading can keep its script busy past one call's wait (the Android emulator, docs/notes/mobile.md
   * "Device checks (M4c, Android)").
   */
  async function captionInfo(
    id: string,
    signal?: AbortSignal,
  ): Promise<YouTubeCaptionInfo> {
    const deadline = Date.now() + PLAYER_RESPONSE_TIMEOUT_MS;
    for (;;) {
      const response = (await call({ type: "getPlayerResponse" }).catch(
        (error: unknown) => {
          if (Date.now() >= deadline) throw error;
          return null;
        },
      )) as { videoDetails?: { videoId?: unknown } } | null;
      if (response?.videoDetails?.videoId === id)
        return youtubeCaptionInfo(response);
      if (Date.now() >= deadline)
        throw new Error(`No player response for ${id}`);
      await sleep(pollMs, signal);
    }
  }

  /**
   * The player's request for this video, asking the player for `original` if needed. The
   * player asks for nothing while an ad plays, and an ad can start after Langle looked
   * (the Android WebView, docs/notes/mobile.md "Device checks (M3d)"): a wait an ad was
   * part of is tried again once the ad has ended. Nor does it take a track before its
   * captions module lists the video's tracks, which on a busy page came after the whole
   * wait (docs/notes/mobile.md "Subtitles missing on an early load (M5f)"): until then
   * Langle keeps waiting, up to `tracksListedTimeoutMs`, then asks anyway.
   */
  async function captureFor(
    id: string,
    original: YouTubeTrack,
    signal?: AbortSignal,
  ): Promise<TimedtextMessage | undefined> {
    const seen = captures.get(id);
    if (seen) return seen;
    let adTries = 0;
    /** How long the player has listed no caption tracks, ads not counted. */
    let unlisted = 0;
    for (;;) {
      while (adShowing()) await sleep(pollMs, signal);
      const since = Date.now();
      const own = await captures.wait(id, playerRequestWaitMs, signal);
      if (own) return own;
      if (adShowing()) continue;
      let ad = false;
      const watch = setInterval(() => {
        ad ||= adShowing();
      }, pollMs);
      try {
        const anyway = unlisted >= tracksListedTimeoutMs;
        const asked = await askPlayer(id, original, anyway, signal);
        if (asked === UNLISTED) {
          unlisted += Date.now() - since;
          continue;
        }
        if (!asked && (ad || adShowing()) && ++adTries <= AD_TRIES) continue;
        if (!asked && anyway)
          console.warn(
            `Langle: YouTube's player listed no caption tracks for ${id} in ${tracksListedTimeoutMs / 1000} s`,
          );
        return asked;
      } finally {
        clearInterval(watch);
      }
    }
  }

  /**
   * Asks the player for `original` and waits for its request; UNLISTED, asking nothing,
   * while the player lists no caption tracks, unless `evenUnlisted`.
   */
  async function askPlayer(
    id: string,
    original: YouTubeTrack,
    evenUnlisted: boolean,
    signal?: AbortSignal,
  ): Promise<TimedtextMessage | undefined | typeof UNLISTED> {
    const loaded = await call({
      type: "loadTrack",
      languageCode: original.lang,
      asr: original.kind === "asr",
      ...(evenUnlisted && { evenUnlisted }),
    });
    if (!loaded) return UNLISTED;
    const { previous } = loaded;
    try {
      return await captures.wait(id, captureTimeoutMs, signal);
    } finally {
      // Put YouTube's own caption choice back as it was.
      await call({ type: "restoreCaptions", previous }).catch(
        (error: unknown) => {
          // Aborted when Langle leaves the page: nothing to put back.
          if (!isAbortError(error)) console.warn("Langle:", error);
        },
      );
    }
  }

  async function loadCaptions(
    request: CaptionRequest,
  ): Promise<VideoCaptions | undefined> {
    const id = videoId();
    if (!id) return undefined;
    const loaded = await loadFrom(id, request, false);
    if (loaded !== AGAIN) return loaded;
    // Once more, with a request the player makes now and the response it makes it from.
    captures.delete(id);
    const retried = await loadFrom(id, request, true);
    return retried === AGAIN ? undefined : retried;
  }

  /**
   * One try of `loadCaptions`. AGAIN, unless `last`, when the kept request was made from
   * another player response than the current one, or when YouTube answered every track
   * fetched with an empty body (on the last try that is logged instead).
   */
  async function loadFrom(
    id: string,
    request: CaptionRequest,
    last: boolean,
  ): Promise<VideoCaptions | undefined | typeof AGAIN> {
    const { signal } = request;
    const listed = await captionInfo(id, signal);
    const wanted = pickOriginalTrack(listed.tracks, request.learningLang);
    if (!wanted) return undefined;
    const capture = await captureFor(id, wanted, signal);
    if (!capture) return undefined;
    // The player may have replaced its response since it was read (it did on a first
    // load, docs/notes/youtube-captions.md): the tracks come from the one read after
    // its request, which must be the response the request was made from.
    const info = await captionInfo(id, signal);
    if (!last && !sameResponse(capture.url, info.tracks)) return AGAIN;
    const original = pickOriginalTrack(info.tracks, request.learningLang);
    if (!original) return undefined;

    const fetched: string[] = [];
    /** The cues of `track` (or of its auto-translation into `tlang`), from the capture or fetched. */
    const cuesOf = async (track: YouTubeTrack, tlang?: string) => {
      if (tlang !== undefined && (await options.refuseTlang?.())) return [];
      const same =
        capture.lang === track.lang &&
        (capture.kind === "asr") === (track.kind === "asr") &&
        (capture.tlang ?? undefined) === tlang;
      if (same) return parseYouTubeJson3(capture.body);
      const body = await fetchTimedtext(
        trackUrl(capture.url, info.tracks, { track, tlang }),
      );
      fetched.push(body);
      return parseYouTubeJson3(body);
    };

    const cues = await cuesOf(original);
    const tlang = autoTranslateCode(info, original, request.nativeLang);
    const translation =
      cues.length === 0
        ? undefined
        : await firstTranslation(
            request,
            {
              tracks: info.tracks.filter((t) => t !== original),
              canAutoTranslate: tlang !== undefined,
            },
            (choice) =>
              choice.source === "siteTrack"
                ? cuesOf(siteTrack(info, choice.track))
                : cuesOf(original, tlang),
          );
    if (fetched.length > 0 && fetched.every((body) => body.trim() === "")) {
      if (!last) return AGAIN;
      console.warn(
        `Langle: YouTube answered every caption track fetched for ${id} with an empty body (${fetched.length})`,
      );
    }
    return translation && { track: original, cues, translation };
  }

  return {
    platform: "youtube",
    videoId,
    title: () =>
      layout.heading() || document.title.replace(/ - YouTube$/, "").trim(),
    url() {
      const id = videoId();
      return id ? `https://www.youtube.com/watch?v=${id}` : href();
    },
    video: () =>
      player()?.querySelector<HTMLVideoElement>("video.html5-main-video") ??
      null,
    playerElement: player,
    controlsPoint: () => layout.controlsPoint(),
    belowVideoElement: () => layout.belowVideoElement(),
    sideColumn: () => layout.sideColumn(),
    vertical: onShorts,
    besidePlayer: () => layout.besidePlayer(),
    adShowing,
    async details() {
      const response = (await call({ type: "getPlayerResponse" })) as {
        videoDetails?: { videoId?: unknown; title?: unknown; author?: unknown };
      } | null;
      const { videoId: id, title, author } = response?.videoDetails ?? {};
      if (typeof id !== "string") return undefined;
      return {
        id,
        ...(typeof title === "string" &&
          title.trim() && { title: title.trim() }),
        ...(typeof author === "string" &&
          author.trim() && { channel: author.trim() }),
      };
    },
    async tracks() {
      const id = videoId();
      return id ? (await captionInfo(id)).tracks : [];
    },
    loadCaptions,
    async seek(ms) {
      await call({ type: "seek", seconds: ms / 1000 });
    },
    async pause() {
      await call({ type: "pause" });
    },
    async play() {
      await call({ type: "play" });
    },
    onNavigate: (listener) => layout.onNavigate(() => listener()),
    fillsWindow: () => layout.fullscreenBox() !== null,
    narrowPlayer,
    hideSiteCaptions: hideCaptions,
    setPageGate: (open) => bridge.setGate(open),
    dispose() {
      for (const cleanup of cleanups.splice(0)) cleanup();
      hideCaptions(false);
      bridge.dispose();
    },
  };
}
