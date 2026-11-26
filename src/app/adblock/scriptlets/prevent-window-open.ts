import {
  negatableTest,
  wrapMethod,
  type ScriptletMeta,
  type Win,
} from "./lib/shared";

export const meta: ScriptletMeta = {
  name: "prevent-window-open",
  aliases: ["nowoif", "no-window-open-if", "window.open-defuser"],
  trusted: false,
};

/**
 * Stops the page's `window.open` calls whose arguments (joined by spaces) match
 * `needle` (`!` turns it around; all calls when empty). They answer null, or with
 * `delay` seconds, the window of a hidden decoy (an iframe, an `<object>` with `obj`)
 * that loads the URL (about:blank with `blank`) and goes after that time.
 */
export default function preventWindowOpen(
  win: Win,
  needle = "",
  delay = "",
  decoy = "",
) {
  const matches = negatableTest(needle);
  wrapMethod(win, "open", (original, self, args) => {
    if (!matches(args.map(String).join(" ")))
      return Reflect.apply(original, self, args);
    const seconds = Number.parseInt(delay, 10);
    if (!(seconds > 0)) return null;
    const url = decoy === "blank" ? "about:blank" : String(args[0] ?? "");
    const element =
      decoy === "obj"
        ? Object.assign(win.document.createElement("object"), { data: url })
        : Object.assign(win.document.createElement("iframe"), { src: url });
    element.style.cssText =
      "display: block; position: absolute; width: 1px; height: 1px; top: -9999px; opacity: 0; pointer-events: none;";
    win.document.documentElement.append(element);
    win.setTimeout(() => element.remove(), seconds * 1000);
    return element.contentWindow;
  });
}
