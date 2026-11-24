import type { CSSProperties, JSX } from "preact";
import type { Span } from "../../core/classify";
import type { Settings } from "../../core/settings";
import { termMark } from "../styles";

type Style = CSSProperties;

/**
 * A term's highlight: mock Main `hlStyle` (`ui`, themed) or the brighter `ovStyle` over a
 * dark video (`onVideo`). Nothing for categories that are switched off.
 */
export function termStyle(
  category: Span["category"],
  on: Settings["highlight"],
  colors: "ui" | "onVideo",
): Style | undefined {
  if (category === "ignored" || !on[category]) return undefined;
  return termMark(category, colors);
}

/** The spans that can be shown, in text order, without overlaps or ignored words. */
export function visibleSpans(spans: readonly Span[]): [Span, number][] {
  const out: [Span, number][] = [];
  let end = 0;
  spans
    .map((span, index) => [span, index] as [Span, number])
    .sort(([a], [b]) => a.start - b.start)
    .forEach(([span, index]) => {
      if (span.category === "ignored" || span.start < end) return;
      out.push([span, index]);
      end = span.end;
    });
  return out;
}

/** A cue's text as Langle shows it: line breaks become spaces. */
export const lineBreaksAsSpaces = (text: string) => text.replaceAll("\n", " ");

/** Punctuation that closes onto the word before it, and that opens onto the word after it. */
const CLOSING = /^[\p{Pe}\p{Pf}\p{Po}]+/u;
const OPENING = /[\p{Ps}\p{Pi}]+$/u;

/**
 * The text of a cue with its terms rendered by `term` and the text between them as
 * is. Line breaks inside the cue become spaces. Punctuation touching a term goes on its
 * line (`white-space: nowrap` around both): WebKit breaks a line between an inline-block
 * term and the period after it.
 */
export function renderTerms(
  text: string,
  spans: readonly Span[] | null,
  term: (span: Span, index: number, text: string) => JSX.Element,
): (string | JSX.Element)[] {
  const flat = lineBreaksAsSpaces;
  if (!spans) return [flat(text)];
  const out: (string | JSX.Element)[] = [];
  let at = 0;
  const visible = visibleSpans(spans);
  visible.forEach(([span, index], i) => {
    const gap = flat(text.slice(at, span.start));
    const opening = OPENING.exec(gap)?.[0] ?? "";
    if (gap.length > opening.length)
      out.push(gap.slice(0, gap.length - opening.length));
    const nextStart = visible[i + 1]?.[0].start ?? text.length;
    const closing =
      CLOSING.exec(flat(text.slice(span.end, nextStart)))?.[0] ?? "";
    const element = term(span, index, flat(text.slice(span.start, span.end)));
    out.push(
      opening || closing ? (
        <span key={`glued ${span.start}`} style={{ whiteSpace: "nowrap" }}>
          {opening}
          {element}
          {closing}
        </span>
      ) : (
        element
      ),
    );
    at = span.end + closing.length;
  });
  if (at < text.length) out.push(flat(text.slice(at)));
  return out;
}
