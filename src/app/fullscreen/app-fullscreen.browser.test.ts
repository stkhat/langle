import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  APP_FULLSCREEN_ATTRIBUTE,
  fullscreenElement,
} from "../../content/fullscreen";
import { APP_FULLSCREEN_NAMES, installAppFullscreen } from "./app-fullscreen";

const FULLSCREEN_HANDLER = APP_FULLSCREEN_NAMES.handler;
const install = () => installAppFullscreen(APP_FULLSCREEN_NAMES);

// Chromium has element fullscreen: each test hides it, as the iPhone's WebKit has none,
// and gives the page a stand-in for the shell's handler.
const HIDDEN: [object, string][] = [
  [Element.prototype, "requestFullscreen"],
  [Element.prototype, "webkitRequestFullscreen"],
  [Document.prototype, "exitFullscreen"],
  [Document.prototype, "fullscreenElement"],
  [Document.prototype, "fullscreenEnabled"],
  [Document.prototype, "fullscreen"],
];
let saved: [object, string, PropertyDescriptor | undefined][] = [];
let posted: string[] = [];

function withoutElementFullscreen(handler = true) {
  saved = HIDDEN.map(([target, name]) => [
    target,
    name,
    Object.getOwnPropertyDescriptor(target, name),
  ]);
  for (const [target, name] of HIDDEN) Reflect.deleteProperty(target, name);
  posted = [];
  if (handler) {
    (globalThis as { webkit?: unknown }).webkit = {
      messageHandlers: {
        [FULLSCREEN_HANDLER]: {
          postMessage: (body: string) => posted.push(body),
        },
      },
    };
  }
}

beforeEach(() => document.body.replaceChildren());
afterEach(() => {
  for (const [target, name, descriptor] of saved) {
    Reflect.deleteProperty(target, name);
    if (descriptor) Object.defineProperty(target, name, descriptor);
  }
  saved = [];
  delete (globalThis as { webkit?: unknown }).webkit;
  for (const style of document.querySelectorAll("style")) style.remove();
});

const covers = (element: Element) => {
  const box = element.getBoundingClientRect();
  return [box.left, box.top, box.width, box.height];
};
const windowBox = () => [0, 0, innerWidth, innerHeight];

function changes() {
  let count = 0;
  const listener = () => count++;
  document.addEventListener("fullscreenchange", listener);
  return {
    get count() {
      return count;
    },
    stop: () => document.removeEventListener("fullscreenchange", listener),
  };
}

describe("installAppFullscreen", () => {
  it("installs nothing where the browser has element fullscreen", () => {
    (globalThis as { webkit?: unknown }).webkit = {
      messageHandlers: { [FULLSCREEN_HANDLER]: { postMessage() {} } },
    };
    expect(install()).toBe(false);
  });

  it("installs nothing without the shell's handler", () => {
    withoutElementFullscreen(false);
    expect(install()).toBe(false);
    expect("requestFullscreen" in Element.prototype).toBe(false);
  });

  it("shows the element over the window, tells the shell, and leaves", async () => {
    withoutElementFullscreen();
    expect(install()).toBe(true);
    expect(document.fullscreenEnabled).toBe(true);
    const player = document.createElement("div");
    player.style.cssText = "width: 200px; height: 100px; margin: 40px";
    document.body.append(player);
    const before = covers(player);
    const seen = changes();

    await player.requestFullscreen();
    expect(document.fullscreenElement).toBe(player);
    expect(fullscreenElement()).toBe(player);
    expect(player.hasAttribute(APP_FULLSCREEN_ATTRIBUTE)).toBe(true);
    expect(covers(player)).toEqual(windowBox());
    expect(posted).toEqual(["on"]);
    expect(seen.count).toBe(1);

    await document.exitFullscreen();
    expect(document.fullscreenElement).toBeNull();
    expect(fullscreenElement()).toBeNull();
    expect(covers(player)).toEqual(before);
    expect(posted).toEqual(["on", "off"]);
    expect(seen.count).toBe(2);
    seen.stop();
    await expect(document.exitFullscreen()).rejects.toThrow();
  });

  it("shows a video in its letterboxed frame, out of a transformed ancestor", async () => {
    withoutElementFullscreen();
    install();
    // A 16:9 player holding a 4:3 video (TED on m.youtube.com), in a transformed box.
    document.body.innerHTML = `
      <div id="page" style="transform: translateX(0); padding: 30px">
        <div id="container" style="position: relative; width: 320px; height: 180px">
          <div id="player" style="position: absolute; inset: 0; transform: matrix(1,0,0,1,0,0)">
            <div id="wrapper" style="position: relative; height: 0">
              <video style="position: absolute; left: 40px; top: 0; width: 240px; height: 180px"></video>
            </div>
            <div id="controls" style="position: absolute; inset: 0"></div>
          </div>
        </div>
      </div>`;
    const video = document.querySelector("video")!;
    const container = document.getElementById("container")!;
    const before = covers(container);

    await video.requestFullscreen();
    // The page sees the element it asked for; Langle sees the box shown.
    expect(document.fullscreenElement).toBe(video);
    expect(fullscreenElement()).toBe(container);
    expect(covers(container)).toEqual(windowBox());
    expect(covers(document.getElementById("controls")!)).toEqual(windowBox());

    await document.exitFullscreen();
    expect(fullscreenElement()).toBeNull();
    expect(covers(container)).toEqual(before);
    expect(
      document.querySelector("[data-langle-app-fullscreen-ancestor]"),
    ).toBeNull();
  });

  it("stops a full-width video's frame at its player, not the long page around it", async () => {
    withoutElementFullscreen();
    install();
    document.body.innerHTML = `
      <main style="height: ${innerHeight * 3}px">
        <div id="player" style="width: 100%; aspect-ratio: 16 / 9">
          <video style="display: block; width: 100%; height: 100%"></video>
        </div>
      </main>`;
    await document.querySelector("video")!.requestFullscreen();
    expect(fullscreenElement()).toBe(document.getElementById("player"));
    await document.exitFullscreen();
  });

  it("moves to another element without telling the shell again", async () => {
    withoutElementFullscreen();
    install();
    const [first, second] = [0, 1].map((): HTMLElement => {
      const box = document.createElement("div");
      box.style.cssText = "width: 50px; height: 50px";
      document.body.append(box);
      return box;
    });
    await first!.requestFullscreen();
    await second!.requestFullscreen();
    expect(fullscreenElement()).toBe(second);
    expect(first!.hasAttribute(APP_FULLSCREEN_ATTRIBUTE)).toBe(false);
    expect(posted).toEqual(["on"]);
    await document.exitFullscreen();
  });
});
