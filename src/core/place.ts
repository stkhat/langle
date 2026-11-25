/**
 * Which stored place (an occurrence, or a meaning choice through its occurrence) a live
 * one is (architecture "Data model" → "Place of a term"). Stored places keep their
 * identity (term, source, sentence: `placeKey`); only the matching of a live video place
 * to them goes by time, so it does not depend on how cards are cut.
 */

/** A stretch of a video, `[startMs, endMs)`: the live card, or cards, holding a term. */
export interface TimeSpan {
  startMs: number;
  endMs: number;
}

/** Whether `value` is a time span (a message's field, checked before it is used). */
export function isTimeSpan(value: unknown): value is TimeSpan {
  if (typeof value !== "object" || value === null) return false;
  const { startMs, endMs } = value as Record<string, unknown>;
  return (
    typeof startMs === "number" &&
    typeof endMs === "number" &&
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    startMs <= endMs
  );
}

/** A live place of a term in one source. */
export interface LivePlace {
  /** The sentence as recording the term there would record it. */
  sentence: string;
  /** In a video: the time span of the card(s) that hold the term now. */
  cardSpan?: TimeSpan;
  /** When the term is said there; the nearest place in the span wins. */
  timeMs?: number;
}

/**
 * The stored place of one term in one source that is `live`: the one with its sentence;
 * else, in a video, one whose time lies in the live card's span (the nearest to
 * `live.timeMs`, else to the span's start; equal: the earlier). A phrase across cards
 * spans every card it covers. Undefined when none is.
 */
export function samePlace<T>(
  rows: readonly T[],
  of: (row: T) => { sentence: string; timeMs?: number | undefined },
  live: LivePlace,
): T | undefined {
  const span = live.cardSpan;
  const at = live.timeMs ?? span?.startMs ?? 0;
  let near: T | undefined;
  let nearMs = 0;
  for (const row of rows) {
    const { sentence, timeMs } = of(row);
    if (sentence === live.sentence) return row;
    if (
      !span ||
      timeMs === undefined ||
      timeMs < span.startMs ||
      timeMs >= span.endMs
    )
      continue;
    const gap = Math.abs(timeMs - at);
    const best = Math.abs(nearMs - at);
    if (near === undefined || gap < best || (gap === best && timeMs < nearMs)) {
      near = row;
      nearMs = timeMs;
    }
  }
  return near;
}
