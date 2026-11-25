// The interface language at the roots of Langle's UI: `lang` and `dir`, and a new
// render when it changes (architecture "Interface language").
import { cloneElement, type ComponentChildren, type VNode } from "preact";
import { useEffect, useReducer } from "preact/hooks";
import { onUiLocaleChange, uiLocale } from "../i18n/t";
import { uiDirection } from "../i18n/ui-locale";

/**
 * The interface language, rendering again when it changes: also when it changed
 * between the first render and the effect that listens.
 */
function useUiLocale(): string {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const locale = uiLocale();
  useEffect(() => {
    const unwatch = onUiLocaleChange(() => bump(undefined));
    if (uiLocale() !== locale) bump(undefined);
    return unwatch;
    // Once: `locale` is the first render's, which the check above compares with.
  }, []);
  return locale;
}

/** `lang` and `dir` of an element that holds the interface. */
const uiLangAttrs = (locale = uiLocale()) => ({
  lang: locale,
  dir: uiDirection(locale),
});

/**
 * Line breaking by the text's own language, wherever it sits in the UI: Korean breaks
 * between words (at spaces) as it is written, Japanese between phrases rather than
 * after any character; a word longer than its line still wraps instead of overflowing.
 * Other languages keep the browser's default.
 */
const LINE_BREAK_CSS =
  ":lang(ko){word-break:keep-all;overflow-wrap:break-word}" +
  ":lang(ja){word-break:auto-phrase}";

/**
 * Puts the interface language on `<html>` of an extension page, now and on each change,
 * and the page's line breaking by language.
 */
export function followDocumentLocale(root = document.documentElement): void {
  const apply = () => {
    const { lang, dir } = uiLangAttrs();
    root.lang = lang;
    root.dir = dir;
  };
  apply();
  onUiLocaleChange(apply);
  const style = document.createElement("style");
  style.textContent = LINE_BREAK_CSS;
  document.head.append(style);
}

/**
 * An extension page in the interface language: the page renders again when the
 * language changes and keeps its state (a new element for the same component).
 */
export function PageLocale(props: { app: VNode }) {
  useUiLocale();
  return cloneElement(props.app);
}

/**
 * Langle's UI on a web page (inside its shadow root) in the interface language: `lang`
 * and `dir` for everything inside, whatever the page's own, and made anew when the
 * language changes, so parts that render only on their own changes (transcript cards,
 * word rows) read the new language too. Their state lives in the content script's stores.
 */
export function UiRoot(props: { children: ComponentChildren }) {
  const locale = useUiLocale();
  return (
    <div key={locale} {...uiLangAttrs(locale)} style={{ display: "contents" }}>
      <style>{LINE_BREAK_CSS}</style>
      {props.children}
    </div>
  );
}
