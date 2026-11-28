import type { Track } from "../../../core/subtitles/types";
import { landingOf, tryNormalizeUrl } from "../../../core/url";
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
  NoAnswerError,
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
  lacksToken,
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
  /** How often to ask anyway while the player lists no caption tracks. */
  unlistedAskEveryMs?: number;
  /** How long to wait for a request with the PO token after one without it. */
  tokenWaitMs?: number;
  /** How long to keep listening for the player's request after the last ask. */
  lateRequestWaitMs?: number;
  /** How long to wait for the player response once the player has loaded media. */
  playerResponseTimeoutMs?: number;
  /** How long to wait for the player response in all. */
  playerLoadTimeoutMs?: number;
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

/**
 * How long to wait for the player response of the current video once the player has
 * loaded media (the previous video's, after SPA navigation). Time before that is not
 * counted: a cold load on a busy phone took 30–50 s to play (docs/notes/mobile.md
 * "Device checks (M6e, Android)").
 */
const PLAYER_RESPONSE_TIMEOUT_MS = 30_000;
/** How long to wait for the player response in all, media or not. */
const PLAYER_LOAD_TIMEOUT_MS = 180_000;
/** Videos whose last captured request is kept (the current one and a few before). */
const KEEP_CAPTURES = 4;
/** How many times the player is asked again after an ad kept it from answering. */
const AD_TRIES = 3;
/** How many times in all the player is asked for a track it took without a request in time. */
const ASK_TRIES = 3;
/**
 * How long the player may take to list the video's caption tracks, ads not counted,
 * before it is asked anyway. A busy page took over 10 s (docs/notes/mobile.md
 * "Subtitles missing on an early load (M5f)").
 */
const TRACKS_LISTED_TIMEOUT_MS = 60_000;
/**
 * While the player lists no caption tracks, how often Langle asks anyway: a player
 * that drops the ask costs nothing, and one whose list Langle cannot read takes it (an
 * ASR-only video's list read without `includeAsr` stayed empty, and Langle waited the
 * whole 60 s: docs/notes/youtube-captions.md "The captions module's track list").
 */
const UNLISTED_ASK_EVERY_MS = 10_000;
/**
 * How long to wait for the player's request with its PO token after it made one without
 * (answered empty): on a busy Android emulator it came 45 s later (docs/notes/mobile.md
 * "Device checks (M6e, Android)").
 */
const TOKEN_WAIT_MS = 90_000;
/**
 * How long to keep listening for the player's request after the last ask, asking nothing
 * more: on a busy Android emulator a player that took the track made its request about
 * 70 s after Langle's first ask, past all ASK_TRIES waits (docs/notes/youtube-captions.md
 * "Late requests on a busy phone").
 */
const LATE_REQUEST_WAIT_MS = 90_000;
/** `askPlayer`'s answer while the player lists no caption tracks: nothing was asked. */
const UNLISTED = Symbol("unlisted");
/** `lateRequest`'s answer when the player made no request in the wait. */
const NONE = Symbol("none");
/** `lateRequest`'s answer when YouTube answered the player's complete request empty. */
const EMPTY = Symbol("empty");
/** A try of `loadCaptions` to make again (see `loadFrom`). */
const AGAIN = Symbol("again");

/** A `loadCaptions` run: where it waits now, in words (`PlatformAdapter.loadStage`). */
interface Loading {
  stage: string;
}

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
  /** The page's URL as it opened, and the occurrence links already landed (`landing`). */
  const opened = href();
  const landed = new Set<string>();
  const pollMs = options.pollMs ?? 250;
  const playerRequestWaitMs = options.playerRequestWaitMs ?? 1500;
  const captureTimeoutMs = options.captureTimeoutMs ?? 10_000;
  const tracksListedTimeoutMs =
    options.tracksListedTimeoutMs ?? TRACKS_LISTED_TIMEOUT_MS;
  const unlistedAskEveryMs =
    options.unlistedAskEveryMs ?? UNLISTED_ASK_EVERY_MS;
  const tokenWaitMs = options.tokenWaitMs ?? TOKEN_WAIT_MS;
  const lateRequestWaitMs = options.lateRequestWaitMs ?? LATE_REQUEST_WAIT_MS;
  const playerResponseTimeoutMs =
    options.playerResponseTimeoutMs ?? PLAYER_RESPONSE_TIMEOUT_MS;
  const playerLoadTimeoutMs =
    options.playerLoadTimeoutMs ?? PLAYER_LOAD_TIMEOUT_MS;
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
  /** The latest `loadCaptions` while it runs: where it waits, in words (`loadStage`). */
  let loading: Loading | undefined;

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
  /** Videos whose player's complete caption request was answered with an empty body (true). */
  const answeredEmpty = createRecent<true>(KEEP_CAPTURES);
  /** When the player's first request without the PO token it needed was answered, per video. */
  const tokenless = createRecent<number>(KEEP_CAPTURES);
  const offTimedtext = bridge.onEvent((message) => {
    // Ads make their own requests: they are kept under their own video id.
    const id = message.videoId;
    if (!id) return;
    if (message.body.trim() !== "") captures.set(id, message);
    else if (!lacksToken(message.url)) answeredEmpty.set(id, true);
    else if (tokenless.get(id) === undefined) tokenless.set(id, Date.now());
  });
  cleanups.push(
    offTimedtext,
    () => captures.clear(),
    () => answeredEmpty.clear(),
    () => tokenless.clear(),
  );
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

  const mainVideo = () =>
    player()?.querySelector<HTMLVideoElement>("video.html5-main-video") ?? null;

  /**
   * Whether the wait for the player response is over: `playerResponseTimeoutMs` counted
   * while the player has media loaded (it loads none before it has a response), or
   * `playerLoadTimeoutMs` in all.
   */
  function responseDeadline(): () => boolean {
    const start = Date.now();
    let last = start;
    let loaded = 0;
    return () => {
      const now = Date.now();
      if ((mainVideo()?.readyState ?? 0) >= HTMLMediaElement.HAVE_METADATA)
        loaded += now - last;
      last = now;
      return (
        loaded >= playerResponseTimeoutMs || now - start >= playerLoadTimeoutMs
      );
    };
  }

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
    const over = responseDeadline();
    for (;;) {
      const response = (await call({ type: "getPlayerResponse" }).catch(
        (error: unknown) => {
          if (over()) throw error;
          return null;
        },
      )) as { videoDetails?: { videoId?: unknown } } | null;
      if (response?.videoDetails?.videoId === id)
        return youtubeCaptionInfo(response);
      if (over()) throw new Error(`No player response for ${id}`);
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
   * Langle keeps waiting, asking anyway every `unlistedAskEveryMs` (a dropped ask costs
   * nothing; a player whose list Langle cannot read takes it), up to
   * `tracksListedTimeoutMs`. And a player that took the track can still make no request
   * within the wait, or make it only after (an early load on the Android emulator,
   * docs/notes/mobile.md "Device checks (M5g, Android)"): it is asked again, up to
   * ASK_TRIES times in all, and a request that came late is taken then; after the last,
   * Langle keeps listening for its request, asking nothing more, up to
   * `lateRequestWaitMs`, then warns. A complete request answered with an empty body is an
   * answer: nothing is asked again, and Langle warns. One made before the player had the
   * PO token it needs is not: the player's request with the token is waited for, up to
   * `tokenWaitMs`. Every way this ends without a request is a warning, and `at.stage`
   * says where it waits meanwhile.
   */
  async function captureFor(
    id: string,
    original: YouTubeTrack,
    at: Loading,
    signal?: AbortSignal,
  ): Promise<TimedtextMessage | undefined> {
    const seen = captures.get(id);
    if (seen) return seen;
    const track = `${original.lang}${original.kind === "asr" ? " (auto-generated)" : ""}`;
    let adTries = 0;
    /** Asks that got no request in time. */
    let asks = 0;
    /** Asks the player took without a request in time, ads not counted. */
    let unanswered = 0;
    /** How long the player has listed no caption tracks, ads not counted. */
    let unlisted = 0;
    /** When to ask next though the player lists no caption tracks. */
    let unlistedAsk = Math.min(unlistedAskEveryMs, tracksListedTimeoutMs);
    for (;;) {
      if (adShowing()) at.stage = "waiting for an ad to end";
      while (adShowing()) await sleep(pollMs, signal);
      const since = Date.now();
      if (asks === 0 && unlisted === 0)
        at.stage = "waiting for the player's own caption request";
      const own = await captures.wait(id, playerRequestWaitMs, signal);
      if (own) return own;
      if (adShowing()) continue;
      let ad = false;
      const watch = setInterval(() => {
        ad ||= adShowing();
      }, pollMs);
      try {
        const anyway = unlisted >= unlistedAsk;
        const asked = await askPlayer(id, original, anyway, signal);
        if (asked === UNLISTED) {
          unlisted += Date.now() - since;
          at.stage = `the player lists no caption tracks yet (${Math.round(unlisted / 1000)} s)`;
          continue;
        }
        if (asked) return asked;
        asks++;
        at.stage = `asked the player for ${track} ${asks} times, no caption request yet`;
        if ((ad || adShowing()) && ++adTries <= AD_TRIES) continue;
        // An empty answer to a complete request is an answer (YouTube gives it to
        // automation): no use asking again.
        if (answeredEmpty.get(id)) return emptyAnswer(id);
        const tokenlessSince = tokenless.get(id);
        if (tokenlessSince !== undefined) {
          at.stage =
            "waiting for the player's caption request with its PO token";
          if (Date.now() - tokenlessSince < tokenWaitMs) continue;
          console.warn(
            `Langle: YouTube's player made its caption requests without its PO token for ${id} for ${tokenWaitMs / 1000} s`,
          );
          return undefined;
        }
        if (anyway) {
          if (unlisted < tracksListedTimeoutMs) {
            unlisted += Date.now() - since;
            unlistedAsk = Math.min(
              unlistedAsk + unlistedAskEveryMs,
              tracksListedTimeoutMs,
            );
            continue;
          }
          console.warn(
            `Langle: YouTube's player listed no caption tracks for ${id} in ${tracksListedTimeoutMs / 1000} s`,
          );
          return undefined;
        }
        if (++unanswered < ASK_TRIES) continue;
        at.stage = `asked the player for ${track} ${asks} times, listening for a late caption request`;
        const late = await lateRequest(id, signal);
        if (late === EMPTY) return emptyAnswer(id);
        if (late !== NONE) return late;
        console.warn(
          `Langle: YouTube's player made no caption request for ${id} after ${ASK_TRIES} asks and ${lateRequestWaitMs / 1000} s`,
        );
        return undefined;
      } finally {
        clearInterval(watch);
      }
    }
  }

  /**
   * The player's request made after the last ask, listened for up to `lateRequestWaitMs`
   * without asking again; EMPTY once a complete request was answered empty, NONE if
   * none came.
   */
  async function lateRequest(
    id: string,
    signal?: AbortSignal,
  ): Promise<TimedtextMessage | typeof EMPTY | typeof NONE> {
    const end = Date.now() + lateRequestWaitMs;
    for (let left = lateRequestWaitMs; left > 0; left = end - Date.now()) {
      const late = await captures.wait(id, Math.min(left, 1000), signal);
      if (late) return late;
      if (answeredEmpty.get(id)) return EMPTY;
    }
    return NONE;
  }

  /**
   * The end of `captureFor` once YouTube answered the player's complete request with an
   * empty body (its answer to automation, and what a refused request gets): no
   * subtitles, said in the log.
   */
  function emptyAnswer(id: string): undefined {
    console.warn(
      `Langle: YouTube answered the player's caption request for ${id} with an empty body`,
    );
    return undefined;
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
    let loaded;
    try {
      loaded = await call({
        type: "loadTrack",
        languageCode: original.lang,
        asr: original.kind === "asr",
        ...(evenUnlisted && { evenUnlisted }),
      });
    } catch (error) {
      if (!(error instanceof NoAnswerError)) throw error;
      // A busy page can answer after the wait and still take the track (the Android
      // emulator, docs/notes/youtube-captions.md "Late requests on a busy phone"): an
      // ask like one the player took without a request. YouTube's own choice, not
      // known, stays as the page leaves it.
      return await captures.wait(id, captureTimeoutMs, signal);
    }
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
    const at: Loading = { stage: "" };
    loading = at;
    try {
      const loaded = await loadFrom(id, request, false, at);
      if (loaded !== AGAIN) return loaded;
      // Once more, with a request the player makes now and the response it makes it from.
      captures.delete(id);
      answeredEmpty.delete(id);
      tokenless.delete(id);
      const retried = await loadFrom(id, request, true, at);
      return retried === AGAIN ? undefined : retried;
    } finally {
      if (loading === at) loading = undefined;
    }
  }

  /**
   * One try of `loadCaptions`. AGAIN, unless `last`, when the kept request was made from
   * another player response than the current one, or when YouTube answered every track
   * fetched with an empty body (on the last try that is logged instead). Every end
   * without subtitles is logged but one: a video without a track in the learning
   * language, which the page shows (Langle's buttons leave the player).
   */
  async function loadFrom(
    id: string,
    request: CaptionRequest,
    last: boolean,
    at: Loading,
  ): Promise<VideoCaptions | undefined | typeof AGAIN> {
    const { signal } = request;
    at.stage = "waiting for the player response";
    const listed = await captionInfo(id, signal);
    const wanted = pickOriginalTrack(listed.tracks, request.learningLang);
    if (!wanted) return undefined;
    const capture = await captureFor(id, wanted, at, signal);
    if (!capture) return undefined;
    // The player may have replaced its response since it was read (it did on a first
    // load, docs/notes/youtube-captions.md): the tracks come from the one read after
    // its request, which must be the response the request was made from.
    at.stage = "reading the player response again after its caption request";
    const info = await captionInfo(id, signal);
    if (!last && !sameResponse(capture.url, info.tracks)) return AGAIN;
    const original = pickOriginalTrack(info.tracks, request.learningLang);
    if (!original) {
      console.warn(
        `Langle: YouTube's player response for ${id} lists no ${request.learningLang} track any more after its caption request`,
      );
      return undefined;
    }
    at.stage = "fetching the caption tracks";

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
    } else if (cues.length === 0) {
      // A body that is not json3 or holds no lines (the player's own, or fetched).
      console.warn(
        `Langle: YouTube's ${original.lang} caption track for ${id} has no lines to show`,
      );
    }
    return translation && { track: original, cues, translation };
  }

  function url() {
    const id = videoId();
    return id ? `https://www.youtube.com/watch?v=${id}` : href();
  }

  return {
    platform: "youtube",
    videoId,
    title: () =>
      layout.heading() || document.title.replace(/ - YouTube$/, "").trim(),
    url,
    landing() {
      // The page's URL now, or as it opened (the site may rewrite it), for this video.
      for (const at of [href(), opened]) {
        const ms = landingOf(at);
        if (ms === undefined || landed.has(at) || tryNormalizeUrl(at) !== url())
          continue;
        landed.add(at);
        return ms;
      }
      return undefined;
    },
    video: mainVideo,
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
    loadStage: () => loading?.stage,
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
