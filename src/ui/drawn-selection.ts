import {
  rangeOfOffsets,
  selectedOffsets,
  selectOffsets,
  type SelectedOffsets,
} from "./selection-in-root";

/**
 * Touch mode's selection of words (spec mobile-app.md "Long-press selection"): Langle
 * draws it itself, as a CSS highlight over the words, not as the page's selection, so
 * the phone draws none of its own over it (iOS's handles and loupe, Android's callout).
 * Where the browser cannot draw highlights, the page's selection stands in.
 */

/** The highlight's name (`::highlight(langle-selection)`). */
const NAME = "langle-selection";

/** Mock MobileYouTube, MobileArticle: the words being selected on a light blue. */
const RULE = `::highlight(${NAME}) { background-color: #C9DAF8; color: #14182B; }`;

/** The words drawn now (one selection at a time), in the text `el`. */
let drawn: { el: Element; from: number; to: number } | undefined;

const registry = (): HighlightRegistry | undefined =>
  typeof CSS !== "undefined" &&
  "highlights" in CSS &&
  typeof Highlight === "function"
    ? CSS.highlights
    : undefined;

let sheet: CSSStyleSheet | undefined;
const styled = new WeakSet<Document | ShadowRoot>();

/** The highlight's look, once in the tree the text is in (a shadow root's styles stay in it). */
function style(el: Element) {
  const root = el.getRootNode();
  if (!(root instanceof ShadowRoot || root instanceof Document)) return;
  if (styled.has(root)) return;
  styled.add(root);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(RULE);
  }
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
}

/** The browser draws highlights: Langle's selection is drawn, not the page's. */
export const canDrawSelection = (): boolean => registry() !== undefined;

/** Shows a part of `el`'s text (offsets in it) as Langle's selection. */
export function drawSelection(el: Element, from: number, to: number): void {
  const highlights = registry();
  if (!highlights) {
    selectOffsets(el, from, to);
    return;
  }
  const range = rangeOfOffsets(el, from, to);
  if (!range) return;
  style(el);
  highlights.set(NAME, new Highlight(range));
  drawn = { el, from, to };
}

/** The part of `el`'s text Langle's selection shows (drawn, or the page's selection). */
export function drawnOffsets(el: Element): SelectedOffsets | undefined {
  if (drawn?.el === el)
    return el.isConnected ? { from: drawn.from, to: drawn.to } : undefined;
  return selectedOffsets(el);
}

/** Drops Langle's selection in `el` (anywhere without it), drawn or the page's. */
export function undrawSelection(el?: Element): void {
  if (drawn && (!el || drawn.el === el)) {
    registry()?.delete(NAME);
    drawn = undefined;
  }
  if (!el || selectedOffsets(el)) getSelection()?.removeAllRanges();
}
