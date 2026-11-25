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

/** Puts the interface language on `<html>` of an extension page, now and on each change. */
export function followDocumentLocale(root = document.documentElement): void {
  const apply = () => {
    const { lang, dir } = uiLangAttrs();
    root.lang = lang;
    root.dir = dir;
  };
  apply();
  onUiLocaleChange(apply);
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
      {props.children}
    </div>
  );
}
