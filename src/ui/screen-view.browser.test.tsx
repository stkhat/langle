import { render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import { ScreenFrame, screenView } from "./screen-view";

let host: HTMLElement;
afterEach(() => {
  render(null, host);
  host.remove();
});

describe("ScreenFrame", () => {
  it("lays its fixed content out in the screen's px over the part of the page on the screen", () => {
    host = document.body.appendChild(document.createElement("div"));
    // A page shown at half its size (no viewport meta), scrolled 20px down by a pinch.
    const view = { left: 10, top: 20, width: 400, height: 800, scale: 2 };
    render(
      <ScreenFrame view={view} zIndex={1}>
        <div
          data-inside
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            height: "100px",
            pointerEvents: "auto",
          }}
        />
      </ScreenFrame>,
      host,
    );
    const frame = host.querySelector<HTMLElement>("[data-screen-frame]")!;
    const inside = host.querySelector<HTMLElement>("[data-inside]")!;
    const box = inside.getBoundingClientRect();
    // 100 screen px tall at the bottom of the view: 50 of the page's px.
    expect([box.left, box.width, box.bottom, box.height]).toEqual([
      10, 400, 820, 50,
    ]);
    expect(getComputedStyle(frame).pointerEvents).toBe("none");
  });
});

describe("screenView", () => {
  it("is the window's box at no zoom", () => {
    const view = screenView();
    expect(view.scale).toBe(1);
    expect([view.left, view.top]).toEqual([0, 0]);
    expect(Math.round(view.width)).toBe(document.documentElement.clientWidth);
  });
});
