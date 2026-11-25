// The direction of text in another language than the interface's, and of what points
// along a line.
import { writtenRightToLeft } from "../core/natives";
import { uiLocale } from "../i18n/t";

/** The interface runs right to left (Arabic's): its layout and arrows mirror. */
const interfaceRightToLeft = (ui: string = uiLocale()) =>
  writtenRightToLeft(ui);

/**
 * The style of an arrow that points along the line (‹ back, › open): mirrored in a
 * right-to-left interface, where back points right. Nothing in a left-to-right one.
 */
export const pointingStyle = (ui: string = uiLocale()) =>
  interfaceRightToLeft(ui) ? { transform: "scaleX(-1)" } : undefined;

/**
 * The step an arrow key takes along a row of tabs: ArrowRight goes on in a
 * left-to-right interface and back in a right-to-left one. 0: another key.
 */
export function arrowStep(key: string, ui: string = uiLocale()): -1 | 0 | 1 {
  const step = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
  return interfaceRightToLeft(ui) && step !== 0 ? (-step as -1 | 1) : step;
}

/**
 * The `lang` and `dir` attributes of an element that holds text in `lang`: text written
 * in the other direction than the interface (`NativeLanguage.rtl`: Arabic in an
 * interface that runs left to right; English or Japanese in an Arabic one) gets its own
 * `dir`. An element with `dir` is a bidi isolate (the HTML user-agent style,
 * `[dir] { unicode-bidi: isolate }`), so the text runs its own way inside the interface:
 * its punctuation, numbers and Latin labels keep their places, nothing around it is
 * reordered, and an ellipsis that cuts it stands at its end. The element itself stays
 * where the layout puts it.
 */
export function langAttrs(
  lang: string | undefined,
  ui: string = uiLocale(),
): {
  lang: string | undefined;
  dir?: "ltr" | "rtl";
} {
  if (lang === undefined) return { lang };
  const rtl = writtenRightToLeft(lang);
  if (rtl === writtenRightToLeft(ui)) return { lang };
  return { lang, dir: rtl ? "rtl" : "ltr" };
}
