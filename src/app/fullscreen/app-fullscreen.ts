import {
  APP_FULLSCREEN_ANCESTOR,
  APP_FULLSCREEN_ATTRIBUTE,
} from "../../content/fullscreen";

/** The names the stand-in uses: its marks, and the shell's handler in the page's world. */
export interface AppFullscreenNames {
  shown: string;
  ancestor: string;
  /** `WebKitPage.fullscreenName` in the iOS shell. */
  handler: string;
}

export const APP_FULLSCREEN_NAMES: AppFullscreenNames = {
  shown: APP_FULLSCREEN_ATTRIBUTE,
  ancestor: APP_FULLSCREEN_ANCESTOR,
  handler: "langleFullscreen",
};

/**
 * The phone app's own fullscreen (docs/plans/mobile-app.md "M3e"), for a page whose
 * browser has no element fullscreen (the iPhone's WebKit). It runs in the page's world
 * at document start and stands in for the Fullscreen API: `requestFullscreen()` shows
 * the element over the window and marks the box shown, `fullscreenchange` fires, and
 * the shell is told (`on` / `off`) so it turns the window to landscape and hides its
 * bars. Pages then take their element-fullscreen path. `fullscreenElement` is the
 * element the page asked for; Langle's world reads the mark (`fullscreenElement()` in
 * `src/content/fullscreen.ts`).
 *
 * The box shown is the element itself, or for an element that cannot hold the page's
 * controls (a video), its frame: its outermost ancestors that wrap it edge to edge on one
 * axis (the letterbox) and fit in the window turned either way, short of the body. A page that asks for its video in fullscreen
 * (m.youtube.com on an iPhone) then shows its player with its controls, as it does in
 * element fullscreen elsewhere. The box's ancestors lose their transforms, filters and
 * containment (which would make `position: fixed` relative to them) and stack on top,
 * as the browser's top layer would put it; the page does not scroll meanwhile. A page that
 * asks for its video expects the system's video player, which has its own exit; asking
 * for the shown video again (its fullscreen button, which stays in view here) leaves.
 *
 * Installs nothing where the browser has element fullscreen, or where the shell has no
 * handler; returns whether it installed. Self-contained (it uses only `names` and the
 * page's globals), so tests can inject its source into a page.
 */
export function installAppFullscreen(names: AppFullscreenNames): boolean {
  const proto = Element.prototype as Partial<{
    requestFullscreen: unknown;
    webkitRequestFullscreen: unknown;
  }>;
  if (proto.requestFullscreen || proto.webkitRequestFullscreen) return false;
  const handler = (
    globalThis as {
      webkit?: {
        messageHandlers?: Record<
          string,
          { postMessage(body: string): void } | undefined
        >;
      };
    }
  ).webkit?.messageHandlers?.[names.handler];
  if (!handler) return false;

  const { shown, ancestor } = names;
  const replaced = ["VIDEO", "IMG", "CANVAS", "IFRAME", "EMBED", "OBJECT"];
  const css = `
[${shown}] {
  position: fixed !important; inset: 0 !important; margin: 0 !important;
  width: 100% !important; height: 100% !important;
  min-width: 0 !important; min-height: 0 !important;
  max-width: none !important; max-height: none !important;
  transform: none !important; box-sizing: border-box !important;
  z-index: 2147483647 !important; background: #000 !important;
}
[${ancestor}] {
  transform: none !important; filter: none !important; backdrop-filter: none !important;
  perspective: none !important; contain: none !important; will-change: auto !important;
  z-index: 2147483647 !important;
}
:root[${ancestor}], :root[${ancestor}] body { overflow: hidden !important; }`;

  const shownBox = (element: Element): Element => {
    if (!replaced.includes(element.tagName)) return element;
    const inner = element.getBoundingClientRect();
    const side = Math.max(innerWidth, innerHeight);
    let frame = element;
    for (
      let parent = element.parentElement;
      parent && parent !== document.body && parent !== document.documentElement;
      parent = parent.parentElement
    ) {
      const box = parent.getBoundingClientRect();
      // A wrapper without a box of its own (no height, say) neither wraps nor stops.
      if (box.width === 0 || box.height === 0) continue;
      const contains =
        box.left <= inner.left + 1 &&
        box.top <= inner.top + 1 &&
        box.right >= inner.right - 1 &&
        box.bottom >= inner.bottom - 1;
      const edgeToEdge =
        Math.abs(box.width - inner.width) <= 1 ||
        Math.abs(box.height - inner.height) <= 1;
      // A player fits in the window turned either way (the shell turns it to landscape),
      // or is no larger than its video; a part of the page that scrolls is larger.
      const fits =
        Math.max(box.width, box.height) <=
        Math.max(side, inner.width, inner.height) + 1;
      if (!contains || !edgeToEdge || !fits) break;
      frame = parent;
    }
    return frame;
  };

  let current: Element | null = null;
  let style: HTMLStyleElement | null = null;

  const changed = (element: Element) => {
    const target = element.isConnected ? element : document;
    target.dispatchEvent(
      new Event("fullscreenchange", { bubbles: true, composed: true }),
    );
  };
  const show = (element: Element) => {
    if (!style) {
      style = document.createElement("style");
      style.textContent = css;
    }
    if (!style.isConnected) document.documentElement.append(style);
    const box = shownBox(element);
    box.setAttribute(shown, "");
    for (let up = box.parentElement; up; up = up.parentElement) {
      up.setAttribute(ancestor, "");
    }
  };
  const leave = (): Element | null => {
    const was = current;
    current = null;
    for (const name of [shown, ancestor]) {
      for (const each of document.querySelectorAll(`[${name}]`)) {
        each.removeAttribute(name);
      }
    }
    return was;
  };

  Object.defineProperties(Element.prototype, {
    requestFullscreen: {
      configurable: true,
      writable: true,
      value(this: Element): Promise<void> {
        if (!this.isConnected) {
          return Promise.reject(new TypeError("Element is not connected"));
        }
        // A video asked for again: the page's own fullscreen button, from a page that
        // expects the system's video player and its exit (m.youtube.com on an iPhone).
        if (current === this) {
          return replaced.includes(this.tagName)
            ? document.exitFullscreen()
            : Promise.resolve();
        }
        const was = leave();
        show(this);
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the element in fullscreen
        current = this;
        if (!was) handler.postMessage("on");
        if (was) changed(was);
        changed(this);
        return Promise.resolve();
      },
    },
  });
  Object.defineProperties(Document.prototype, {
    exitFullscreen: {
      configurable: true,
      writable: true,
      value(): Promise<void> {
        const was = leave();
        if (!was) return Promise.reject(new TypeError("Not in fullscreen"));
        handler.postMessage("off");
        changed(was);
        return Promise.resolve();
      },
    },
    fullscreenElement: {
      configurable: true,
      get: () => (current?.isConnected ? current : null),
    },
    fullscreenEnabled: { configurable: true, get: () => true },
    fullscreen: { configurable: true, get: () => current !== null },
  });
  return true;
}
