import { primary } from "../languages";
import { nativeLanguage } from "../natives";
import {
  isSoundLabel,
  lowerBound,
  SENTENCE_END,
  type SentenceCards,
} from "./cues";
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
  /**
   * How far the translated cues' times may be off the original's (ms, `timingError`);
   * when left out, time alone decides.
   */
  timingErrorMs?: number;
}

/**
 * A translated cue also goes to every other original cue it covers at least this share of
 * (in time). Measured on human Japanese tracks timed apart from the English: at half, cards
 * left with no line drop to almost none while lines with a neighbour's text barely grow;
 * lower shares mostly add grazing neighbours (architecture.md, "Choosing a translation").
 */
const COVERED_SHARE = 0.5;

/**
 * Translated text for each original cue (transcript cards, or subtitle lines), in the same
 * order as `original`.
 * Each translated cue goes to the original cue it overlaps most in time (ties go to the
 * earlier one), except that a spoken line goes to a sound label such as "(Laughter)" only
 * when it overlaps nothing else. It also goes to every other original cue of its kind
 * (spoken or sound label) that it covers at least half of, so a translated line that spans
 * two cards shows on both. Several landing on one cue are joined in time order. Translated
 * cues that overlap no original cue are dropped, and line breaks are flattened. Original
 * cues that get nothing map to "". When every translated cue starts and ends exactly where
 * an original cue does (YouTube auto-translation keeps the original's timing), cues are
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
  // Starts and ends both: a human line merged over two original cues starts where the
  // first does but covers the second too.
  const sameSegmentation =
    translated.length > 0 &&
    translated.every(
      (t) => original[indexByStart.get(t.startMs) ?? -1]?.endMs === t.endMs,
    );

  const longestMs = original.reduce(
    (max, cue) => Math.max(max, cue.endMs - cue.startMs),
    0,
  );
  // In time order, so that each card's lines are joined in the order they play.
  const inOrder = [...translated].sort((a, b) => a.startMs - b.startMs);
  if (sameSegmentation) {
    for (const t of inOrder)
      parts[indexByStart.get(t.startMs) as number]?.push(flatten(t.text));
    return parts.map((list) => list.join(joiner));
  }
  const placed = inOrder.map((t) => overlapping(original, t, longestMs));
  const primaries =
    options.timingErrorMs === undefined
      ? []
      : choosePrimaries(original, inOrder, placed, options.timingErrorMs);
  inOrder.forEach((t, k) => {
    const { most, covered } = placed[k] as Placement;
    const primary = primaries[k] ?? most;
    if (primary < 0) return;
    const targets = [...new Set([primary, ...covered])].sort((a, b) => a - b);
    for (const target of targets) parts[target]?.push(flatten(t.text));
  });
  return parts.map((list) => list.join(joiner));
}

/** How a translated cue lies on the original cues (`overlapping`). */
interface Placement {
  /** The cue it overlaps most (a spoken line: the spoken cue it overlaps most), or -1. */
  most: number;
  /** The other cues of its kind it covers at least `COVERED_SHARE` of. */
  covered: number[];
  /** A spoken line's spoken cues it overlaps, in order, with the overlap (ms). */
  spoken: [index: number, overlapMs: number][];
  /** The line's length in characters, spaces left out. */
  length: number;
}

/** Variance of a card's translated length, per character expected (see `choosePrimaries`). */
const LENGTH_VARIANCE = 6;
/** Cost of a card boundary after a translated line that ends no sentence, or a clause. */
const SENTENCE_CUT = 2;
const CLAUSE_CUT = 1;
/** A track ends its lines with marks when at least this share of them end with one. */
const PUNCTUATED_SHARE = 0.2;
const CLAUSE_END = /[,;:、，；：][”"'’)\]」』]*$/;

const lengthOf = (text: string) => text.replace(/\s/g, "").length;

/**
 * The card each spoken translated line goes to, by index in `inOrder` (undefined for lines
 * not decided here). A human track is often timed a second or so off the original and cut
 * elsewhere, so a line that straddles two sentences may lie mostly over the wrong one.
 * Like a length-based sentence aligner (Gale and Church), the lines go to the cards in
 * order, each card's lines in a row, at the least cost of:
 * - time: a line's time outside its card, in units of the track's `timingError`, squared
 *   and halved (so a track timed with the original's cues keeps to time alone);
 * - length: each card's translation is expected to be the track's ratio of translated to
 *   original characters times its own length, with a variance of LENGTH_VARIANCE per
 *   expected character (a card left without a line costs its whole expected length);
 * - cuts: in a track whose lines end with marks, a card boundary after a line that ends no
 *   sentence costs SENTENCE_CUT, after a clause mark CLAUSE_CUT.
 */
function choosePrimaries(
  original: readonly Cue[],
  inOrder: readonly Cue[],
  placed: readonly Placement[],
  timingErrorMs: number,
): (number | undefined)[] {
  const result: (number | undefined)[] = inOrder.map(() => undefined);
  const items = placed.flatMap((p, k) => (p.spoken.length ? [k] : []));
  if (!items.length) return result;
  const cards = [
    ...new Set(items.flatMap((k) => placed[k]!.spoken.map(([i]) => i))),
  ].sort((a, b) => a - b);
  let originalChars = 0;
  for (const i of cards) originalChars += lengthOf(original[i]!.text);
  let translatedChars = 0;
  for (const k of items) translatedChars += placed[k]!.length;
  const ratio = originalChars > 0 ? translatedChars / originalChars : 0;
  const lengthCost = (card: number, length: number) => {
    const expected = Math.max(1, ratio * lengthOf(original[card]!.text));
    return (length - expected) ** 2 / (2 * LENGTH_VARIANCE * expected);
  };
  // Prefix sums of the cost of leaving each card (in `cards` order) without a line.
  const emptyBefore = [0];
  for (const c of cards)
    emptyBefore.push(emptyBefore[emptyBefore.length - 1]! + lengthCost(c, 0));
  const rank = new Map(cards.map((c, r) => [c, r]));
  /** Cost of the cards strictly between `after` and `before` getting no line. */
  const skipped = (after: number, before: number) => {
    const from = after < 0 ? 0 : rank.get(after)! + 1;
    const to =
      before > cards[cards.length - 1]! ? cards.length : rank.get(before)!;
    return to > from ? emptyBefore[to]! - emptyBefore[from]! : 0;
  };
  const timeCost = (k: number, overlapMs: number) => {
    const t = inOrder[k]!;
    const outside = (t.endMs - t.startMs - overlapMs) / timingErrorMs;
    return (outside * outside) / 2;
  };
  const ends = items.map((k) => {
    const text = inOrder[k]!.text.trim();
    return SENTENCE_END.test(text) ? 2 : CLAUSE_END.test(text) ? 1 : 0;
  });
  const punctuated =
    ends.filter((e) => e > 0).length >= PUNCTUATED_SHARE * ends.length;
  /** Cost of a card boundary right after item `n`. */
  const cutAfter = (n: number) =>
    !punctuated || n < 0 ? 0 : [SENTENCE_CUT, CLAUSE_CUT, 0][ends[n]!]!;

  type State = {
    cost: number;
    from: [n: number, last: number] | null;
    card: number;
  };
  // best[n]: the cheapest ways to place the first n items, by the card of the last run.
  const best: Map<number, State>[] = [
    new Map([[-1, { cost: 0, from: null, card: -1 }]]),
  ];
  for (let n = 1; n <= items.length; n++) best.push(new Map());
  for (let n = 0; n < items.length; n++) {
    const states = [...best[n]!];
    const firstCards = placed[items[n]!]!.spoken.map(([i]) => i);
    // A line that cannot follow in order (two speakers at once) may go back to an earlier
    // card, from the cheapest way so far.
    const stuck = !states.some(([last]) => firstCards.some((c) => c > last));
    const from = stuck
      ? [states.reduce((x, y) => (y[1].cost < x[1].cost ? y : x))]
      : states;
    for (const [last, state] of from) {
      for (const card of firstCards) {
        if (card <= last && !stuck) continue;
        const enter =
          state.cost +
          (card > last ? skipped(last, card) : 0) +
          cutAfter(n - 1);
        let length = 0;
        let time = 0;
        for (let m = n; m < items.length; m++) {
          const hit = placed[items[m]!]!.spoken.find(([i]) => i === card);
          if (!hit) break;
          length += placed[items[m]!]!.length;
          time += timeCost(items[m]!, hit[1]);
          const cost = enter + lengthCost(card, length) + time;
          const seen = best[m + 1]!.get(card);
          if (!seen || cost < seen.cost)
            best[m + 1]!.set(card, { cost, from: [n, last], card });
        }
      }
    }
  }
  let end: State | undefined;
  for (const state of best[items.length]!.values()) {
    const cost = state.cost + skipped(state.card, Infinity);
    if (!end || cost < end.cost + skipped(end.card, Infinity)) end = state;
  }
  let n = items.length;
  for (let state = end; state?.from;) {
    const [from, last] = state.from;
    for (let m = from; m < n; m++) result[items[m]!] = state.card;
    n = from;
    state = best[from]!.get(last);
  }
  return result;
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
 * Where `t` lies on the original cues: the one it overlaps the most (a spoken line skips
 * sound labels when it overlaps a spoken cue too), every other one of its kind that it
 * covers at least `COVERED_SHARE` of, and a spoken line's spoken cues. `most` is -1 when it
 * overlaps none.
 */
function overlapping(
  original: readonly Cue[],
  t: Cue,
  longestMs: number,
): Placement {
  // Only cues starting in (t.start - longest, t.end) can overlap t.
  const from = firstStartingAtOrAfter(original, t.startMs - longestMs);
  const to = firstStartingAtOrAfter(original, t.endMs);
  const spokenLine = !isSoundLabel(t.text);
  const best = { any: -1, anyOverlap: 0, spoken: -1, spokenOverlap: 0 };
  const covered: number[] = [];
  const spoken: [number, number][] = [];
  for (let i = from; i < to; i++) {
    const o = original[i] as Cue;
    const overlap = Math.min(o.endMs, t.endMs) - Math.max(o.startMs, t.startMs);
    if (overlap <= 0) continue;
    const spokenCue = !isSoundLabel(o.text);
    if (overlap > best.anyOverlap)
      Object.assign(best, { any: i, anyOverlap: overlap });
    if (spokenLine && spokenCue) {
      spoken.push([i, overlap]);
      if (overlap > best.spokenOverlap)
        Object.assign(best, { spoken: i, spokenOverlap: overlap });
    }
    if (
      spokenCue === spokenLine &&
      overlap >= COVERED_SHARE * (o.endMs - o.startMs)
    )
      covered.push(i);
  }
  const most = best.spoken >= 0 ? best.spoken : best.any;
  return {
    most,
    covered: most < 0 ? [] : covered,
    spoken,
    length: lengthOf(t.text),
  };
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

const TIMING_ERROR_MIN_MS = 100;
const TIMING_ERROR_SCALE = 2;

/**
 * How far a human track's times are off the learning track's: twice the median distance
 * from a translated cue's start or end to the nearest start or end of a learning cue, at
 * least TIMING_ERROR_MIN_MS. A track cut and timed with the original's cues is off by
 * nothing (its cues share their edges); one timed on its own (whole seconds, another clock,
 * its own cuts) by about a second.
 */
export function timingError(
  learning: readonly Cue[],
  human: readonly Cue[],
): number {
  const edges = learning
    .flatMap((c) => [c.startMs, c.endMs])
    .sort((a, b) => a - b);
  if (!edges.length || !human.length) return TIMING_ERROR_MIN_MS;
  const nearest = (ms: number) => {
    const i = lowerBound(edges.length, (k) => edges[k]! < ms);
    return Math.min(
      i < edges.length ? edges[i]! - ms : Infinity,
      i > 0 ? ms - edges[i - 1]! : Infinity,
    );
  };
  const distances = human
    .flatMap((c) => [nearest(c.startMs), nearest(c.endMs)])
    .sort((a, b) => a - b);
  const median = distances[distances.length >> 1]!;
  return Math.max(TIMING_ERROR_MIN_MS, TIMING_ERROR_SCALE * median);
}
