import type { Cue } from "./types";

type Timed = Pick<Cue, "startMs" | "endMs">;

/**
 * Index of the last cue (sorted by start time) that started at or before `ms`, or -1
 * before the first one.
 */
export const lastStartedIndex = (cues: readonly Timed[], ms: number) =>
  lowerBound(cues.length, (i) => cues[i]!.startMs <= ms) - 1;

/** The first index in `0…length` where `before` is false; `before` holds for a prefix of them. */
export function lowerBound(
  length: number,
  before: (i: number) => boolean,
): number {
  let lo = 0;
  let hi = length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (before(mid)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Index of the cue playing at `ms` in cues sorted by start time, or -1.
 * A cue covers [startMs, endMs). When cues overlap, the one that started last wins.
 */
export function cueIndexAt(cues: readonly Timed[], ms: number): number {
  const found = lastStartedIndex(cues, ms);
  if (found < 0) return -1;
  return ms < (cues[found] as Timed).endMs ? found : -1;
}

export function cueAt(cues: readonly Cue[], ms: number): Cue | undefined {
  const index = cueIndexAt(cues, ms);
  return index < 0 ? undefined : cues[index];
}

/** Text that ends a sentence: . ! ? … ♪ (or their CJK forms), maybe before closing quotes. */
export const SENTENCE_END = /[.!?。！？…♪][”"'’)\]」』]*$/;
const SOUND_LABEL = /^[[(（].*[\])）]$/;

/** A sound label such as "[Music]", "(LAUGHS)" or "（拍手）". */
export function isSoundLabel(text: string): boolean {
  return SOUND_LABEL.test(text.trim());
}

/** One subtitle line shown in the video: a part of a transcript card's text. */
export interface SubtitleLine {
  startMs: number;
  endMs: number;
  /** The card (sentence) the line is part of. */
  card: number;
  /** Where the line's text is in the card's text: [start, end). */
  start: number;
  end: number;
  /**
   * Where each of its words starts in the card's text and when the site says it is said
   * (YouTube's word times, or a manual cue's time spread over its words), in order.
   */
  words?: LineWord[];
}

/** A word of a subtitle line: its start in the card's text, and the site's time for it. */
export interface LineWord {
  start: number;
  startMs: number;
}

/** Transcript cards and the subtitle lines they are made of. */
export interface SentenceCards {
  cards: Cue[];
  /** Sorted by start time, like the cues they come from. */
  lines: SubtitleLine[];
}

/**
 * The index of the line of card `card` that holds `offset` of its text: the last of the
 * card's lines that starts at or before it (lines are sorted by time, so a card's lines are
 * together and in order); -1 when the card has no line.
 */
export function lineIndexAt(
  lines: readonly SubtitleLine[],
  card: number,
  offset: number,
): number {
  let line = -1;
  for (
    let i = lowerBound(lines.length, (i) => lines[i]!.card < card);
    i < lines.length && lines[i]!.card === card && lines[i]!.start <= offset;
    i++
  )
    line = i;
  return line;
}

/**
 * When the text at `offset` of card `card` is said, by the site's own timing: the start of
 * the last word of its line that starts at or before it, else of the line, else of the card.
 * It does not depend on how Langle cuts cards or lines, only on the site's words.
 */
export function timeAt(
  cards: readonly Cue[],
  lines: readonly SubtitleLine[],
  card: number,
  offset: number,
): number {
  const index = lineIndexAt(lines, card, offset);
  if (index < 0) return cards[card]?.startMs ?? 0;
  const line = lines[index]!;
  let ms = line.startMs;
  for (const word of line.words ?? []) {
    if (word.start > offset) break;
    ms = word.startMs;
  }
  return ms;
}

/**
 * Where to seek once a video opened from an occurrence link to `targetMs` (`landingOf`)
 * has its cards: back to the start of the card that holds that time, so its sentence plays
 * from the start however cards are cut now. Only while the player is still inside that
 * card (the viewer has not moved); undefined when no card holds the time, or no seek is
 * needed.
 */
export function landingSeek(
  cards: readonly Cue[],
  targetMs: number,
  playerMs: number,
): number | undefined {
  const card = cards[cueIndexAt(cards, targetMs)];
  if (!card) return undefined;
  return playerMs > card.startMs && playerMs < card.endMs
    ? card.startMs
    : undefined;
}
