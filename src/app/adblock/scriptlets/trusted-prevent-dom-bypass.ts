import { wrapMethod, type ScriptletMeta, type Win } from "./lib/shared";

export const meta: ScriptletMeta = {
  name: "trusted-prevent-dom-bypass",
  aliases: [],
  trusted: true,
};

/** The iframes in what a DOM method was given. */
function framesIn(win: Win, node: unknown): HTMLIFrameElement[] {
  if (node instanceof win.HTMLIFrameElement) return [node];
  if (node instanceof win.Element || node instanceof win.DocumentFragment)
    return [...node.querySelectorAll("iframe")];
  return [];
}

/**
 * Keeps the page from reaching unpatched functions through an iframe of its own: after
 * a call of `method` (`Node.prototype.appendChild`) puts a same-origin iframe without a
 * URL of its own in the page, the iframe's `targetProp` (`fetch`) is this window's, or
 * without `targetProp`, its `contentWindow` is this window.
 */
export default function trustedPreventDomBypass(
  win: Win,
  method = "",
  targetProp = "",
) {
  if (method === "") return;
  const fix = (frame: HTMLIFrameElement) => {
    const src = frame.getAttribute("src");
    if (src && !/^(about:|javascript:)/i.test(src.trim())) return;
    let inner: (Window & Record<string, unknown>) | null;
    try {
      inner = frame.contentWindow as (Window & Record<string, unknown>) | null;
      if (!inner?.location.href) return;
    } catch {
      return;
    }
    try {
      if (targetProp !== "")
        Object.defineProperty(inner, targetProp, {
          configurable: true,
          writable: true,
          value: (win as unknown as Record<string, unknown>)[targetProp],
        });
      else Object.defineProperty(frame, "contentWindow", { get: () => win });
    } catch {
      // A property the frame keeps to itself stays as it is.
    }
  };
  wrapMethod(win, method, (original, self, args) => {
    const result: unknown = Reflect.apply(original, self, args);
    for (const arg of args) for (const frame of framesIn(win, arg)) fix(frame);
    return result;
  });
}
