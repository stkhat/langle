import { primary } from "../languages";
import { nativeLanguage } from "../natives";
import { isSoundLabel, lowerBound, type SentenceCards } from "./cues";
import type { Cue, Track } from "./types";

/**
 * Where a video's translation comes from (spec, "Choosing a translation"). One choice per
 * video, never switched midway.
 * - siteTrack: the site's human-made subtitle track in the native language
 * - siteAutoTranslate: the site's machine translation of the original track (YouTube `tlang`)
 * - builtIn: the browser's built-in translator
 * - none: no translation
 */
export type TranslationChoice =
  | { source: "siteTrack"; track: Track }
  | { source: "siteAutoTranslate" }
  | { source: "builtIn" }
  | { source: "none" };

export interface TranslationInput {
  /** Every subtitle track the site offers for the video. */
  tracks: readonly Track[];
  nativeLang: string;
  /** The site can machine-translate the original track into the native language. */
  canAutoTranslate: boolean;
  /** The browser's built-in translator can translate the original language into the native one. */
  translatorAvailable: boolean;
}

export function chooseTranslation(input: TranslationInput): TranslationChoice {
  const native = input.nativeLang.toLowerCase();
  const manual = input.tracks.filter((t) => t.kind === "manual");
  const track =
    manual.find((t) => t.lang.toLowerCase() === native) ??
    manual.find((t) => primary(t.lang) === primary(native));
  if (track) return { source: "siteTrack", track };
  if (input.canAutoTranslate) return { source: "siteAutoTranslate" };
  if (input.translatorAvailable) return { source: "builtIn" };
  return { source: "none" };
}

/**
 * What goes between two joined lines in `lang` (a native or learning language): nothing
 * in a language written without spaces (`NativeLanguage.spaces`), else a space.
 */
export function joinerFor(lang: string): string {
  return nativeLanguage(primary(lang))?.spaces === false ? "" : " ";
}

export interface AlignOptions {
  /** Language of the translated cues; decides how joined lines are separated. */
  lang: string;
}

/**
 * A translated cue also goes to every other original cue it covers at least this share of
 * (in time). Measured on human Japanese tracks timed apart from the English: at half, cards
 * left with no line drop to almost none while lines with a neighbour's text barely grow;
 * lower shares mostly add grazing neighbours (architecture.md, "Choosing a translation").
 */
const COVERED_SHARE = 0.5;

/**
 * Translated text for each original cue (transcript cards), in the same order as `original`.
 * Each translated cue goes to the original cue it overlaps most in time (ties go to the
 * earlier one), except that a spoken line goes to a sound label such as "(Laughter)" only
 * when it overlaps nothing else. It also goes to every other original cue of its kind
 * (spoken or sound label) that it covers at least half of, so a translated line that spans
 * two cards shows on both. Several landing on one cue are joined in time order. Translated
 * cues that overlap no original cue are dropped, and line breaks are flattened. Original
 * cues that get nothing map to "". When every translated cue starts exactly where an
 * original cue starts (YouTube auto-translation keeps the original's timing), cues are
 * mapped one to one. `original` must be sorted by start time; `translated` need not be.
 */
export function alignByOverlap(
  original: readonly Cue[],
  translated: readonly Cue[],
  options: AlignOptions,
): string[] {
  const joiner = joinerFor(options.lang);
  const flatten = (text: string) => text.split("\n").join(joiner);
  const parts: string[][] = original.map(() => []);

  const indexByStart = new Map<number, number>();
  original.forEach((cue, i) => {
    if (!indexByStart.has(cue.startMs)) indexByStart.set(cue.startMs, i);
  });
  const sameSegmentation =
    translated.length > 0 &&
    translated.every((t) => indexByStart.has(t.startMs));

  const longestMs = original.reduce(
    (max, cue) => Math.max(max, cue.endMs - cue.startMs),
    0,
  );
  // In time order, so that each card's lines are joined in the order they play.
  const inOrder = [...translated].sort((a, b) => a.startMs - b.startMs);
  for (const t of inOrder) {
    const targets = sameSegmentation
      ? [indexByStart.get(t.startMs) as number]
      : overlapping(original, t, longestMs);
    for (const target of targets) parts[target]?.push(flatten(t.text));
  }
  return parts.map((list) => list.join(joiner));
}

/** The most words in a card made by `joinCoveredCards`. */
const MAX_JOINED_WORDS = 30;
const SPEAKER_DASH = /^[-–—]/;

/**
 * Joins adjacent cards that one translated cue covers at least `COVERED_SHARE` of each, up
 * to MAX_JOINED_WORDS words: a human translation often puts two short sentences into one
 * line ("They feel fear and doubt. They procrastinate."), which would otherwise show on
 * both cards (rule G). The subtitle lines (and their words) move with their cards. `joiner` goes between the
 * joined texts (a line break before a speaker's dash line).
 */
export function joinCoveredCards(
  sentences: SentenceCards,
  translated: readonly Cue[],
  joiner: string,
): SentenceCards {
  const covers = (t: Cue, c: Cue) =>
    Math.min(t.endMs, c.endMs) - Math.max(t.startMs, c.startMs) >=
    COVERED_SHARE * (c.endMs - c.startMs);
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
  const inOrder = [...translated].sort((a, b) => a.startMs - b.startMs);
  const longestMs = inOrder.reduce(
    (max, t) => Math.max(max, t.endMs - t.startMs),
    0,
  );
  /** A translated cue that covers both `a` and `b` (in time order, `a` first). */
  const coveredTogether = (a: Cue, b: Cue) => {
    const from = firstStartingAtOrAfter(inOrder, b.startMs - longestMs);
    for (let i = from; i < inOrder.length; i++) {
      const t = inOrder[i] as Cue;
      if (t.startMs >= a.endMs) break;
      if (covers(t, a) && covers(t, b)) return true;
    }
    return false;
  };
  /** Where each card went: the new card and where its text starts in it. */
  const target: [card: number, offset: number][] = [];
  const cards: Cue[] = [];
  sentences.cards.forEach((card, i) => {
    const last = cards[cards.length - 1];
    const previous = sentences.cards[i - 1];
    if (
      last &&
      previous &&
      words(last.text) + words(card.text) <= MAX_JOINED_WORDS &&
      coveredTogether(previous, card)
    ) {
      const separator = SPEAKER_DASH.test(card.text) ? "\n" : joiner;
      target.push([cards.length - 1, last.text.length + separator.length]);
      last.text += separator + card.text;
      last.endMs = Math.max(last.endMs, card.endMs);
    } else {
      target.push([cards.length, 0]);
      cards.push({ startMs: card.startMs, endMs: card.endMs, text: card.text });
    }
  });
  return {
    cards,
    lines: sentences.lines.map((line) => {
      const [card, offset] = target[line.card] as [number, number];
      return {
        ...line,
        card,
        start: line.start + offset,
        end: line.end + offset,
        ...(line.words && {
          words: line.words.map((word) => ({
            ...word,
            start: word.start + offset,
          })),
        }),
      };
    }),
  };
}

const firstStartingAtOrAfter = (cues: readonly Cue[], ms: number) =>
  lowerBound(cues.length, (i) => cues[i]!.startMs < ms);

/**
 * Indexes of the original cues `t` goes to, in order: the one it overlaps the most (a
 * spoken line skips sound labels when it overlaps a spoken cue too), and every other one of
 * its kind that it covers at least `COVERED_SHARE` of. Empty when it overlaps none.
 */
function overlapping(
  original: readonly Cue[],
  t: Cue,
  longestMs: number,
): number[] {
  // Only cues starting in (t.start - longest, t.end) can overlap t.
  const from = firstStartingAtOrAfter(original, t.startMs - longestMs);
  const to = firstStartingAtOrAfter(original, t.endMs);
  const spokenLine = !isSoundLabel(t.text);
  const best = { any: -1, anyOverlap: 0, spoken: -1, spokenOverlap: 0 };
  const covered: number[] = [];
  for (let i = from; i < to; i++) {
    const o = original[i] as Cue;
    const overlap = Math.min(o.endMs, t.endMs) - Math.max(o.startMs, t.startMs);
    if (overlap <= 0) continue;
    const spokenCue = !isSoundLabel(o.text);
    if (overlap > best.anyOverlap)
      Object.assign(best, { any: i, anyOverlap: overlap });
    if (spokenLine && spokenCue && overlap > best.spokenOverlap)
      Object.assign(best, { spoken: i, spokenOverlap: overlap });
    if (
      spokenCue === spokenLine &&
      overlap >= COVERED_SHARE * (o.endMs - o.startMs)
    )
      covered.push(i);
  }
  const most = best.spoken >= 0 ? best.spoken : best.any;
  if (most < 0) return [];
  return [...new Set([most, ...covered])].sort((a, b) => a - b);
}

const OFFSET_MIN_CUES = 8;
const OFFSET_RANGE_MS = 1500;
const OFFSET_STEP_MS = 50;
/** A cue start "matches" when a learning cue starts this close. */
const OFFSET_MATCH_MS = 300;
/** The smallest offset worth repairing: below it, jitter is as likely as a shifted clock. */
const OFFSET_MIN_MS = 150;
/** How much more of the starts the shift must match than no shift does. */
const OFFSET_MIN_GAIN = 0.1;

/** The share of `human` starts, moved by `offset`, within OFFSET_MATCH_MS of a `learning` start (both sorted). */
function matchShare(
  learning: readonly number[],
  human: readonly number[],
  offset: number,
): number {
  let hits = 0;
  let j = 0;
  for (const start of human) {
    const t = start + offset;
    while (
      j + 1 < learning.length &&
      Math.abs(learning[j + 1]! - t) <= Math.abs(learning[j]! - t)
    )
      j++;
    if (Math.abs(learning[j]! - t) <= OFFSET_MATCH_MS) hits++;
  }
  return hits / human.length;
}

/**
 * How far to move a human translation track so its cues start with the learning track's
 * (ms to add; 0 when it is already in step or no shift is clear). Some translators time
 * their track from another clock a few hundred ms off. Tries every offset within ±1.5 s
 * in 50 ms steps for the one that lines up most cue starts, and takes it only when it is
 * at least 150 ms and lines up 0.1 more of the starts than no shift does (equal best
 * shifts: the middle of the first run of them). Times only, so it holds for any language; needs 8 cues on each side.
 */
export function trackOffset(
  learning: readonly Cue[],
  human: readonly Cue[],
): number {
  if (learning.length < OFFSET_MIN_CUES || human.length < OFFSET_MIN_CUES)
    return 0;
  const byTime = (a: number, b: number) => a - b;
  const l = learning.map((c) => c.startMs).sort(byTime);
  const h = human.map((c) => c.startMs).sort(byTime);
  const zero = matchShare(l, h, 0);
  // Equal shares form a plateau (every offset within the match window of the true one
  // matches the same starts): take its middle, the first plateau of the best share.
  let bestShare = zero;
  let from = 0;
  let to = 0;
  let open = false;
  for (let o = -OFFSET_RANGE_MS; o <= OFFSET_RANGE_MS; o += OFFSET_STEP_MS) {
    const share = matchShare(l, h, o);
    if (share > bestShare) {
      [bestShare, from, to, open] = [share, o, o, true];
    } else if (share === bestShare && open) to = o;
    else open = false;
  }
  const best = Math.round((from + to) / 2 / OFFSET_STEP_MS) * OFFSET_STEP_MS;
  return Math.abs(best) >= OFFSET_MIN_MS && bestShare - zero >= OFFSET_MIN_GAIN
    ? best
    : 0;
}

/** `cues` moved by `offset` ms. */
export function shiftCues(cues: readonly Cue[], offset: number): Cue[] {
  return offset === 0
    ? [...cues]
    : cues.map((c) => ({
        ...c,
        startMs: c.startMs + offset,
        endMs: c.endMs + offset,
      }));
}
