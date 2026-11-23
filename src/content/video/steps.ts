import {
  STEP_ACTIONS,
  stepKeyOf,
  type StepAction,
  type StepKeys,
} from "../../core/settings";
import type { Cue } from "../../core/subtitles/types";

type Timed = Pick<Cue, "startMs" | "endMs">;

/**
 * A normal frame's step and more is a seek, not playback (ms): crossing a card's end by
 * seeking does not pause the video.
 */
const PLAY_STEP_MAX_MS = 1000;
/**
 * How early the video pauses before a card's end, at most (ms): the pause lands within
 * the card, so its line is still the one shown, however far the next frame would go.
 */
const PAUSE_LEAD_MAX_MS = 250;
/**
 * The video goes on a little between the frame that asks for the pause and the pause
 * (more where the site's player takes the request): the pause is asked for this much
 * (ms) earlier than the next frame alone would need, and a pause that still lands past
 * the end goes back to this much before it.
 */
export const PAUSE_MARGIN_MS = 80;

/**
 * The action a key press asks for (spec "Video UI": "Stepping through sentences"), or
 * undefined: keys off, another key, a modifier held, or the press goes to a text field.
 */
export function stepActionOf(
  event: Pick<
    KeyboardEvent,
    "key" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey" | "isComposing"
  > & { target?: EventTarget | null; composedPath?: () => EventTarget[] },
  keys: StepKeys,
): StepAction | undefined {
  if (!keys.on || event.shiftKey || event.isComposing) return undefined;
  const key = stepKeyOf(event);
  if (key === undefined) return undefined;
  const target = event.composedPath?.()[0] ?? event.target;
  if (typing(target)) return undefined;
  return STEP_ACTIONS.find((action) => keys[action] === key);
}

/** The target takes text: a field, a select or an editable element (a comment box). */
function typing(target: EventTarget | null | undefined): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element))
    return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return target.matches("input, textarea, select, [contenteditable]");
}

/**
 * The card an action goes to from `current` (the card that started last; -1 before the
 * first), or undefined where there is none: before the first card or past the last.
 */
export function stepTarget(
  cardCount: number,
  current: number,
  action: StepAction,
): number | undefined {
  const target =
    action === "previous"
      ? current - 1
      : action === "replay"
        ? current
        : current + 1;
  return target >= 0 && target < cardCount ? target : undefined;
}

/** Where card `index` ends: its end, or the next card's start when that comes first. */
export const cardEnd = (cards: readonly Timed[], index: number) =>
  Math.min(cards[index]!.endMs, cards[index + 1]?.startMs ?? Infinity);

/**
 * The card to pause after ("Pause after each sentence"), or undefined: `card` played at
 * `fromMs`, playback went on to `toMs`, and that step crossed the card's end or the next
 * step of about the same length would. A jump of a second or more is a seek and pauses
 * nothing.
 */
export function cardEnding(
  cards: readonly Timed[],
  card: number,
  fromMs: number,
  toMs: number,
): number | undefined {
  const step = toMs - fromMs;
  if (card < 0 || card >= cards.length || step <= 0 || step >= PLAY_STEP_MAX_MS)
    return undefined;
  const end = cardEnd(cards, card);
  if (fromMs >= end) return undefined;
  const lead = Math.min(step + PAUSE_MARGIN_MS, PAUSE_LEAD_MAX_MS);
  return toMs + lead >= end ? card : undefined;
}
