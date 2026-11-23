import type { Settings } from "../../core/settings";
import { warn } from "../lookup/warn";
import type { Store } from "../store";
import type { PlatformAdapter } from "./platform";
import type { VideoState } from "./state";
import {
  cardEnd,
  cardEnding,
  PAUSE_MARGIN_MS,
  stepActionOf,
  stepTarget,
} from "./steps";

export interface Stepping {
  /** The video played on to `ms` (`playing` unless paused): pauses at a card's end. */
  tick(ms: number, playing: boolean): void;
  stop(): void;
}

/**
 * Steps through the transcript's cards with the step keys and pauses after each card
 * when the menu's switch is on (spec "Video UI": "Stepping through sentences"). Only
 * while Langle is on for a video whose cards are read, with no ad playing and not on a
 * Short. A step key the site would also take (Netflix's S) goes to Langle then.
 */
export function startStepping(o: {
  store: Store<VideoState>;
  adapter: Pick<
    PlatformAdapter,
    "video" | "adShowing" | "vertical" | "seek" | "play" | "pause"
  >;
  settings: () => Settings;
  /** Where key presses are listened for. Default: this window. */
  target?: Window;
}): Stepping {
  const { store, adapter, settings } = o;
  /** The playing time and card at the last tick. */
  let last: { ms: number; card: number } | undefined;
  /** The card the video paused after, until another card plays or the video jumps. */
  let pausedAfter = -1;

  const active = () => {
    const s = store.get();
    return (
      s.enabled &&
      s.status === "ready" &&
      s.cues.length > 0 &&
      !adapter.adShowing() &&
      !adapter.vertical?.()
    );
  };

  function onKey(event: KeyboardEvent) {
    if (!active()) return;
    const action = stepActionOf(event, settings().stepKeys);
    if (!action) return;
    // The key is Langle's: the site does not act on it too.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat && action === "replay") return;
    const s = store.get();
    const target = stepTarget(s.cues.length, s.card, action);
    if (target === undefined) return;
    pausedAfter = -1;
    last = undefined;
    adapter
      .seek(s.cues[target]!.startMs)
      .then(() => (adapter.video()?.paused ? adapter.play() : undefined))
      .catch(warn);
  }

  const target = o.target ?? window;
  target.addEventListener("keydown", onKey, { capture: true });

  return {
    tick(ms, playing) {
      const prev = last;
      const { card, cues } = store.get();
      last = { ms, card };
      if (!prev) return;
      const ending =
        playing && settings().pauseEachSentence && active()
          ? cardEnding(cues, prev.card, prev.ms, ms)
          : undefined;
      if (ending !== undefined && ending !== pausedAfter) {
        pausedAfter = ending;
        const end = cardEnd(cues, ending);
        const back = Math.max(cues[ending]!.startMs, end - PAUSE_MARGIN_MS);
        adapter
          .pause()
          // Paused past the end: back to where the card's line still shows.
          .then(() =>
            (adapter.video()?.currentTime ?? 0) * 1000 >= end
              ? adapter.seek(back)
              : undefined,
          )
          .catch(warn);
        return;
      }
      // Another card plays, or the video jumped (not Langle's step back while paused).
      if ((playing && card !== pausedAfter) || Math.abs(ms - prev.ms) >= 1000)
        pausedAfter = -1;
    },
    stop() {
      target.removeEventListener("keydown", onKey, { capture: true });
    },
  };
}
