import { afterEach, describe, expect, it } from "vitest";
import { controlsTopIn, shownControls, topClearOf } from "./site-controls";
import { phoneColumn } from "./VideoUi";

const SCREEN = { left: 0, top: 0, right: 390, bottom: 844 };
const PLAYER = { left: 0, top: 48, right: 390, bottom: 267 };

let root: HTMLElement;
afterEach(() => root?.remove());

/** m.youtube.com's portrait controls, as measured (docs/notes/mobile.md). */
function controls(html: string) {
  root = document.createElement("div");
  root.style.cssText = "position: fixed; inset: 0;";
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

const at = (left: number, top: number, width: number, height: number) =>
  `position: absolute; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px; padding: 0;`;

describe("shownControls", () => {
  it("finds the buttons, sliders and links drawn now, not hidden, faded, tiny or off the screen", () => {
    controls(`
      <button style="${at(318, 48, 48, 48)}">gear</button>
      <div role="slider" style="${at(30, 223, 330, 44)}"></div>
      <a href="#" style="${at(12, 60, 172, 49)}">unmute</a>
      <button style="${at(167, 130, 56, 56)} visibility: hidden">play</button>
      <div style="opacity: 0"><button style="${at(122, 203, 97, 24)}">time</button></div>
      <button style="${at(12, 12, 12, 12)}">a11y</button>
      <button style="${at(500, 48, 48, 48)}">off screen</button>
      <div style="display: none"><button style="${at(0, 0, 48, 48)}">gone</button></div>
    `);
    expect(shownControls([root], SCREEN)).toEqual([
      { left: 318, top: 48, right: 366, bottom: 96 },
      { left: 30, top: 223, right: 360, bottom: 267 },
      { left: 12, top: 60, right: 184, bottom: 109 },
    ]);
  });

  it("counts a control once when two roots hold it", () => {
    controls(`<div><button style="${at(10, 10, 40, 40)}">x</button></div>`);
    expect(shownControls([root, root.firstElementChild!], SCREEN)).toHaveLength(
      1,
    );
  });
});

describe("topClearOf", () => {
  const pill = { left: 12, top: 60, right: 100, bottom: 88 };

  it("keeps the place when no control covers it", () => {
    expect(
      topClearOf([{ left: 222, top: 48, right: 270, bottom: 96 }], pill, 8),
    ).toBe(60);
  });

  it("goes under the control over it, and under the next one it then meets", () => {
    const unmute = { left: 0, top: 48, right: 196, bottom: 121 };
    const below = { left: 40, top: 125, right: 90, bottom: 160 };
    expect(topClearOf([unmute], pill, 8)).toBe(129);
    expect(topClearOf([below, unmute], pill, 8)).toBe(168);
  });
});

describe("phoneColumn", () => {
  it("is the mock's column without a safe area", () => {
    expect(
      phoneColumn({ top: 0, right: 0, bottom: 0, left: 0 }, "left"),
    ).toEqual({
      width: 300,
      top: 16,
      bottom: 16,
      side: 44,
      room: 356,
    });
  });

  it("keeps clear of the camera's island at its side and the home bar", () => {
    // An iPhone in landscape, the island at the left (docs/notes/mobile.md).
    const safe = { top: 0, right: 62, bottom: 21, left: 62 };
    expect(phoneColumn(safe, "left")).toEqual({
      width: 300,
      top: 16,
      bottom: 21,
      side: 62,
      room: 374,
    });
  });
});

describe("controlsTopIn", () => {
  it("gives the top of the highest control in the area's lower half", () => {
    const boxes = [
      { left: 318, top: 48, right: 366, bottom: 96 }, // the gear, at the top
      { left: 167, top: 130, right: 223, bottom: 186 }, // play, in the middle
      { left: 318, top: 191, right: 366, bottom: 239 }, // fullscreen
      { left: 30, top: 223, right: 360, bottom: 267 }, // the seek bar
    ];
    expect(controlsTopIn(boxes, PLAYER)).toBe(191);
    expect(controlsTopIn(boxes.slice(0, 2), PLAYER)).toBeNull();
  });
});
