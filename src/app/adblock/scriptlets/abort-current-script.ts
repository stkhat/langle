import {
  abortError,
  onChain,
  textTest,
  type ScriptletMeta,
  type Win,
} from "./lib/shared";

export const meta: ScriptletMeta = {
  name: "abort-current-script",
  aliases: ["acs", "abort-current-inline-script", "acis"],
  trusted: false,
};

/** A `data:` URI's script text, or undefined for any other URL. */
function dataScript(src: string): string | undefined {
  const match = /^data:[^,]*?(;base64)?,(.*)$/s.exec(src);
  if (!match) return undefined;
  try {
    return match[1] ? atob(match[2] ?? "") : decodeURIComponent(match[2] ?? "");
  } catch {
    return undefined;
  }
}

/**
 * Throws in an inline script that reads or writes a property chain on `window` when
 * the script's text matches `needle` (any script when empty), or in a script whose
 * `src` is a `data:` URI whose text matches `srcNeedle`.
 */
export default function abortCurrentScript(
  win: Win,
  chain = "",
  needle = "",
  srcNeedle = "",
) {
  if (chain === "") return;
  const matchesText = textTest(needle);
  const matchesSrc = srcNeedle === "" ? undefined : textTest(srcNeedle);
  const own = win.document.currentScript;
  const aborts = () => {
    const script = win.document.currentScript;
    if (!(script instanceof win.HTMLScriptElement) || script === own)
      return false;
    if (script.src === "") return matchesText(script.text);
    if (!matchesSrc) return false;
    const text = dataScript(script.src);
    return text !== undefined && matchesSrc(text);
  };
  onChain(win, chain, (owner, property) => {
    const descriptor = Object.getOwnPropertyDescriptor(owner, property);
    if (descriptor && !descriptor.configurable) return;
    let value = owner[property];
    Object.defineProperty(owner, property, {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      get(this: unknown) {
        if (aborts()) throw abortError(win);
        return descriptor?.get ? descriptor.get.call(this) : value;
      },
      set(this: unknown, next: unknown) {
        if (aborts()) throw abortError(win);
        if (descriptor?.set) descriptor.set.call(this, next);
        else value = next;
      },
    });
  });
}
