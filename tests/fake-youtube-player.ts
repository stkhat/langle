// A stand-in for YouTube's player API on `#movie_player` (or Shorts' `#shorts-player`), for the browser tests (called
// directly) and the E2E tests (passed to `addInitScript`, so it must not use imports or
// anything outside the function). It behaves like the parts of the real player Langle
// uses (see docs/notes/youtube-captions.md): `setOption("captions", "track", …)` makes
// an XMLHttpRequest to the track's `baseUrl` plus client params and, when the `baseUrl`
// names `exp=xpe`, a PO token, unless that track is already the one on; the track set is
// kept in localStorage, and the next load of the page starts with it on, without
// requesting it (seen on youtube.com, 2026-11-18). It can also replace its player
// response before its first caption request, as youtube.com's player did on a first
// load (2026-11-18).

export interface FakePlayerOptions {
  videoId: string;
  title: string;
  /** A player response with `captions` (like `captionTracks.json`). */
  playerResponse: unknown;
  /**
   * The response the player swaps in for `playerResponse` just before its first caption
   * request (see `refreshedPlayerResponse`).
   */
  refreshedResponse?: unknown;
  /** The player requests the first caption track itself once the video plays. */
  captionsOn?: boolean;
  /** The player element's id. Default: `shorts-player` on a Short's URL, else `movie_player`. */
  playerId?: string;
  /**
   * The player's captions module lists the video's tracks only this long after the
   * player is set up; until then `getOption("captions", "tracklist")` answers undefined
   * and a track set is dropped, as youtube.com's player did on a slowed load
   * (docs/notes/mobile.md "Subtitles missing on an early load (M5f)").
   */
  tracksListedAfterMs?: number;
  /**
   * The player sends each caption request only this long after the track is set, as
   * m.youtube.com's player sometimes did on an early load on the Android emulator
   * (docs/notes/mobile.md "Device checks (M5g, Android)").
   */
  requestDelayMs?: number;
  /**
   * The player has its PO token only this long after it is set up: requests made before
   * carry none (YouTube answers them with an empty body), as m.youtube.com's player's
   * first request on a busy Android emulator did (docs/notes/mobile.md "Device checks
   * (M6e, Android)").
   */
  tokenAfterMs?: number;
  /**
   * `getOption("captions", "tracklist")` answers undefined even with `includeAsr`, yet a
   * track set is taken: a player whose list Langle cannot read (as an ASR-only video's
   * list without `includeAsr`, docs/notes/youtube-captions.md "The captions module's
   * track list").
   */
  listsNoTracks?: boolean;
  /**
   * A pre-roll ad plays this long from setup (`ad-showing` on the player): the player
   * asks for no captions of the video, and its captions module lists the video's tracks
   * only once the ad has ended (`tracksListedAfterMs` after that, when set). How the
   * real player lists them during an ad is unmeasured (no ad was served in the device
   * checks, docs/notes/mobile.md "Subtitles missing on an early load (M5f)"): this is
   * the case least favourable to Langle.
   */
  adMs?: number;
}

/** The localStorage keys where the fake keeps the caption track set (as YouTube's player does). */
export const FAKE_CAPTION_STORAGE = {
  language: "yt-player-caption-sticky-language",
  track: "yt-player-caption-persistence",
} as const;

/**
 * `response` as youtube.com's player replaced the page's initial one on a first load
 * (2026-11-18): every `baseUrl` without `exp=xpe` (so the player's request carries no PO
 * token) and with the new response's own `ei` and `signature`.
 */
export function refreshedPlayerResponse<T>(response: T, ei = "REFRESHED"): T {
  const copy = structuredClone(response) as T & {
    captions?: {
      playerCaptionsTracklistRenderer?: {
        captionTracks?: { baseUrl: string }[];
      };
    };
  };
  for (const track of copy.captions?.playerCaptionsTracklistRenderer
    ?.captionTracks ?? []) {
    const url = new URL(track.baseUrl);
    const q = url.searchParams;
    q.delete("exp");
    q.set("ei", ei);
    q.set("signature", `${ei}-SIGNATURE`);
    const signed = q.get("sparams");
    if (signed)
      q.set(
        "sparams",
        signed
          .split(",")
          .filter((name) => name !== "exp")
          .join(","),
      );
    track.baseUrl = url.href;
  }
  return copy;
}

/** What the fake records, on `player.fake`. */
export interface FakePlayerLog {
  setOption: unknown[][];
  unloadModule: string[];
  seekTo: number[];
  /** `pauseVideo` and `playVideo` calls, in order. */
  playback: ("pause" | "play")[];
  requests: string[];
}

export function installFakeYouTubePlayer(options: FakePlayerOptions): void {
  interface RawTrack {
    baseUrl: string;
    languageCode: string;
    kind?: string;
    vssId?: string;
    name?: { simpleText?: string };
  }
  interface TrackOption {
    languageCode?: string;
    kind?: string;
    translationLanguage?: { languageCode: string };
  }

  // Inline, not FAKE_CAPTION_STORAGE: this function runs on its own in the E2E page.
  const STORED_LANGUAGE = "yt-player-caption-sticky-language";
  const STORED_TRACK = "yt-player-caption-persistence";

  const setup = () => {
    const player = document.getElementById(
      options.playerId ??
        (location.pathname.startsWith("/shorts/")
          ? "shorts-player"
          : "movie_player"),
    ) as (HTMLElement & Record<string, unknown>) | null;
    if (!player) return;
    const video = player.querySelector("video");
    let videoId = options.videoId;
    let title = options.title;
    type Response = {
      captions?: {
        playerCaptionsTracklistRenderer?: { captionTracks?: RawTrack[] };
      };
    };
    let response = options.playerResponse as Response;
    let refreshed = options.refreshedResponse as Response | undefined;
    let track: TrackOption = storedTrack();
    const log: FakePlayerLog = {
      setOption: [],
      unloadModule: [],
      seekTo: [],
      playback: [],
      requests: [],
    };

    /** The track set on an earlier load: on again, without a request for it. */
    function storedTrack(): TrackOption {
      try {
        const stored = localStorage.getItem(STORED_TRACK);
        return stored ? (JSON.parse(stored) as TrackOption) : {};
      } catch {
        return {};
      }
    }

    const sameTrack = (a: TrackOption, b: TrackOption) =>
      (a.languageCode ?? "") === (b.languageCode ?? "") &&
      (a.kind ?? "") === (b.kind ?? "") &&
      (a.translationLanguage?.languageCode ?? "") ===
        (b.translationLanguage?.languageCode ?? "");

    const captionTracks = () =>
      response.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    let listed = options.tracksListedAfterMs === undefined && !options.adMs;
    const listAfter = (ms: number) =>
      setTimeout(() => {
        listed = true;
      }, ms);
    if (options.adMs) {
      player.classList.add("ad-showing");
      setTimeout(() => {
        player.classList.remove("ad-showing");
        listAfter(options.tracksListedAfterMs ?? 0);
      }, options.adMs);
    } else if (!listed) listAfter(options.tracksListedAfterMs ?? 0);
    let hasToken = options.tokenAfterMs === undefined;
    if (!hasToken)
      setTimeout(() => {
        hasToken = true;
      }, options.tokenAfterMs);

    function request(option: TrackOption) {
      if (refreshed) {
        response = refreshed;
        refreshed = undefined;
      }
      const raw = captionTracks().find(
        (t) =>
          t.languageCode === option.languageCode &&
          (t.kind ?? "") === (option.kind ?? ""),
      );
      // The player asks for no captions of the video while an ad plays.
      if (!raw || player?.classList.contains("ad-showing")) return;
      const base = new URL(raw.baseUrl, location.href);
      const url = new URL(base.pathname + base.search, location.origin);
      // youtube.com's player adds its PO token to a baseUrl naming exp=xpe only, once
      // it has one.
      if (hasToken && url.searchParams.get("exp")?.split(",").includes("xpe")) {
        url.searchParams.set("potc", "1");
        url.searchParams.set("pot", "FAKE-PO-TOKEN");
      }
      url.searchParams.set("fmt", "json3");
      if (option.translationLanguage)
        url.searchParams.set("tlang", option.translationLanguage.languageCode);
      url.searchParams.set("c", "WEB");
      url.searchParams.set("cplayer", "UNIPLAYER");
      const send = () => {
        // A page removed since (the browser tests' next test) makes no request.
        if (!player?.isConnected) return;
        log.requests.push(url.href);
        const xhr = new XMLHttpRequest();
        xhr.open("GET", url.href);
        xhr.send();
      };
      if (options.requestDelayMs) setTimeout(send, options.requestDelayMs);
      else send();
    }

    function setOption(module: string, key: string, value: TrackOption) {
      log.setOption.push([module, key, value]);
      if (module !== "captions" || key !== "track") return;
      // Before its captions module lists the tracks, the player drops the track set.
      if (!listed) return;
      // The track already on: nothing to load.
      if (sameTrack(value, track)) return;
      track = value;
      if (!value.languageCode) return;
      localStorage.setItem(STORED_LANGUAGE, value.languageCode);
      localStorage.setItem(
        STORED_TRACK,
        JSON.stringify({
          languageCode: value.languageCode,
          kind: value.kind ?? "",
          ...(value.translationLanguage && {
            translationLanguage: value.translationLanguage,
          }),
        }),
      );
      request(value);
    }

    Object.assign(player, {
      fake: log,
      getPlayerResponse: () => ({
        videoDetails: { videoId, title },
        captions: response.captions,
      }),
      getVideoData: () => ({ video_id: videoId, title }),
      loadModule() {},
      unloadModule(name: string) {
        log.unloadModule.push(name);
        if (name === "captions") track = {};
      },
      getOption(module: string, key: string, how?: { includeAsr?: boolean }) {
        if (module !== "captions") return undefined;
        if (key === "track") return track;
        if (key === "tracklist" && (!listed || options.listsNoTracks))
          return undefined;
        // Auto-generated tracks are listed only with includeAsr (www and m.youtube.com,
        // 2026-11-27).
        if (key === "tracklist")
          return captionTracks()
            .filter((t) => how?.includeAsr || t.kind !== "asr")
            .map((t) => ({
              languageCode: t.languageCode,
              languageName: t.name?.simpleText ?? t.languageCode,
              kind: t.kind ?? "",
              vss_id: t.vssId ?? "",
            }));
        return undefined;
      },
      setOption,
      seekTo(seconds: number) {
        log.seekTo.push(seconds);
        if (video) video.currentTime = seconds;
      },
      pauseVideo() {
        log.playback.push("pause");
        video?.pause();
      },
      playVideo() {
        log.playback.push("play");
        void video?.play().catch(() => {});
      },
      /** Replaces the current video's player response (keeping the track on). */
      fakeReplaceResponse(next: unknown) {
        response = next as Response;
        refreshed = undefined;
      },
      /** Switches to another video as YouTube's SPA navigation does. */
      fakeNavigate(next: {
        videoId: string;
        title: string;
        playerResponse: unknown;
      }) {
        videoId = next.videoId;
        title = next.title;
        response = next.playerResponse as Response;
        refreshed = undefined;
        track = {};
        document.dispatchEvent(
          new CustomEvent("yt-navigate-finish", {
            detail: {
              response: {
                playerResponse: { videoDetails: { videoId, title } },
              },
            },
          }),
        );
      },
    });

    // The full screen button, as on youtube.com: the whole page (<html>) goes
    // fullscreen, and the watch page moves the player into its full-bleed row over
    // the screen (docs/notes/youtube-captions.md).
    const fullscreenButton = player.querySelector(".ytp-fullscreen-button");
    fullscreenButton?.addEventListener("click", () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    });
    const playerBox = document.getElementById("player-container");
    const home = playerBox?.parentElement;
    document.addEventListener("fullscreenchange", () => {
      const on = document.fullscreenElement !== null;
      player.closest("ytd-watch-flexy")?.toggleAttribute("fullscreen", on);
      const row = document.getElementById("player-full-bleed-container");
      if (playerBox && home && row) (on ? row : home).append(playerBox);
      fullscreenButton?.setAttribute(
        "aria-label",
        on ? "Exit full screen (f)" : "Full screen (f)",
      );
    });

    if (options.captionsOn && video) {
      video.addEventListener(
        "playing",
        () => {
          const first = captionTracks()[0];
          if (first)
            setOption("captions", "track", {
              languageCode: first.languageCode,
              kind: first.kind ?? "",
            });
        },
        { once: true },
      );
    }
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  else setup();
}
