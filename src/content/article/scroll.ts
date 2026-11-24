/** The nearest ancestor that scrolls its content vertically, else null (the window). */
function scrollerOf(start: Element | null): Element | null {
  for (
    let element = start;
    element &&
    element !== document.body &&
    element !== document.documentElement;
    element = element.parentElement
  ) {
    const { overflowY } = getComputedStyle(element);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      element.scrollHeight > element.clientHeight
    )
      return element;
  }
  return null;
}

/**
 * Scrolls a piece of text to the middle of the view, smoothly: in the element that
 * scrolls it (a page that scrolls inside a box), else the window. Unlike
 * `scrollIntoView` on its element, the text itself lands in the middle, not its
 * paragraph.
 */
export function scrollToMiddle(range: Range): void {
  const rect = range.getBoundingClientRect();
  const node = range.startContainer;
  const scroller = scrollerOf(
    node instanceof Element ? node : node.parentElement,
  );
  const middle = rect.top + rect.height / 2;
  if (scroller) {
    const box = scroller.getBoundingClientRect();
    scroller.scrollBy({
      top: middle - (box.top + scroller.clientHeight / 2),
      behavior: "smooth",
    });
  } else window.scrollBy({ top: middle - innerHeight / 2, behavior: "smooth" });
}

/** Mock MobileArticle: the dictionary sheet's top at half height, as a share of the window. */
const SHEET_TOP_SHARE = 0.45;

/** Touch mode: where the article's dictionary sheet starts, in px from the window's top. */
export const sheetTop = (): number => Math.round(innerHeight * SHEET_TOP_SHARE);

/** Room kept between the text and the window's top or the sheet (px). */
const ROOM = 16;

/**
 * Touch mode: scrolls a piece of text into the space above the dictionary sheet when
 * the sheet would cover it (or it is above the window), to the middle of that space,
 * smoothly, in the element that scrolls it or else the window.
 */
export function keepAboveSheet(range: Range): void {
  const rect = range.getBoundingClientRect();
  const top = sheetTop();
  if (rect.top >= ROOM && rect.bottom <= top - ROOM) return;
  const node = range.startContainer;
  const scroller =
    scrollerOf(node instanceof Element ? node : node.parentElement) ?? window;
  scroller.scrollBy({
    top: rect.top + rect.height / 2 - top / 2,
    behavior: "smooth",
  });
}
