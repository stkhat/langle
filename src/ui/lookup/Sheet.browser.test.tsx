import { render } from "preact";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanUpMounts, mountInShadowRoot } from "../../testing/shadow-root";
import { canTouch, swipe } from "../../testing/touch";
import { pointIn } from "../../testing/mouse";
import { Sheet } from "./Sheet";

afterEach(cleanUpMounts);

async function mountSheet() {
  const onClose = vi.fn();
  const screen = await mountInShadowRoot(
    <Sheet
      label="Dictionary"
      top={380}
      onClose={onClose}
      header={<span>Learning</span>}
    >
      <p>The entry</p>
      <div style={{ height: "2000px", flex: "none" }}>Long content</div>
    </Sheet>,
  );
  const sheet = screen.getByRole("complementary", { name: "Dictionary" });
  await expect.element(sheet).toBeVisible();
  const element = sheet.element() as HTMLElement;
  const grab = element.querySelector<HTMLElement>("[data-sheet-grab]")!;
  const top = () => Math.round(element.getBoundingClientRect().top);
  return { screen, element, grab, top, onClose };
}

describe("Sheet", () => {
  test("fills the bottom of the window from the top it is given, with a grab handle", async () => {
    const { screen, element, top } = await mountSheet();
    expect(top()).toBe(380);
    const box = element.getBoundingClientRect();
    expect(Math.round(box.bottom)).toBe(innerHeight);
    expect(Math.round(box.left)).toBe(0);
    expect(Math.round(box.width)).toBe(document.documentElement.clientWidth);
    const handle = element.querySelector<HTMLElement>("[data-sheet-handle]")!;
    expect(handle.getAttribute("aria-hidden")).toBe("true");
    expect(handle.getBoundingClientRect().width).toBe(36);
    await expect.element(screen.getByText("Learning")).toBeVisible();
    await expect.element(screen.getByText("The entry")).toBeVisible();
  });

  test("scrolls its content, not the page", async () => {
    const { element } = await mountSheet();
    const body = element.querySelector<HTMLElement>("[data-sheet-body]")!;
    expect(getComputedStyle(body).overflowY).toBe("auto");
    expect(getComputedStyle(body).overscrollBehaviorY).toBe("contain");
    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
  });

  test("stays where it is on the screen when the page is pinched or panned under it", async () => {
    // A stand-in for the visual viewport, which a test cannot pinch.
    const own = Object.getOwnPropertyDescriptor(window, "visualViewport");
    const view = Object.assign(new EventTarget(), {
      offsetLeft: 0,
      offsetTop: 0,
      width: innerWidth,
      height: innerHeight,
      scale: 1,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      get: () => view,
    });
    try {
      const { top } = await mountSheet();
      expect(top()).toBe(380);
      // Zoomed in two times and panned 100 px down: 380 screen px are 190 of the page's.
      Object.assign(view, {
        offsetTop: 100,
        width: innerWidth / 2,
        height: innerHeight / 2,
        scale: 2,
      });
      view.dispatchEvent(new Event("resize"));
      // After the sheet's 0.2 s move, had it moved.
      await new Promise((done) => setTimeout(done, 400));
      expect(top()).toBe(100 + 190);
    } finally {
      if (own) Object.defineProperty(window, "visualViewport", own);
      else delete (window as { visualViewport?: unknown }).visualViewport;
    }
  });

  test("tells the phone app while a sheet shows, once for a sheet that remounts", async () => {
    const pageSheet = vi.fn<(open: boolean) => Promise<void>>(async () => {});
    const g = globalThis as { appHost?: unknown };
    g.appHost = { pageSheet };
    const host = document.body.appendChild(document.createElement("div"));
    try {
      const sheet = (key: string) => (
        <Sheet key={key} label="Dictionary" top={380} onClose={() => {}}>
          <p>The entry</p>
        </Sheet>
      );
      render(sheet("first"), host);
      await expect.poll(() => pageSheet.mock.calls).toEqual([[true]]);
      // Another word looked up: the old sheet goes as the new one comes.
      render(sheet("second"), host);
      await new Promise((done) => setTimeout(done, 20));
      expect(pageSheet.mock.calls).toEqual([[true]]);
      render(null, host);
      await expect.poll(() => pageSheet.mock.calls).toEqual([[true], [false]]);
    } finally {
      render(null, host);
      host.remove();
      delete g.appHost;
    }
  });

  describe.runIf(canTouch)("swipes on the handle", () => {
    test("up gives it the full height, down brings it back", async () => {
      const { grab, top, onClose } = await mountSheet();
      const start = pointIn(grab);
      await swipe([start, { ...start, y: start.y - 40 }, { ...start, y: 100 }]);
      await expect.poll(top).toBe(0);
      const again = pointIn(grab);
      await swipe([again, { ...again, y: again.y + 40 }, { ...again, y: 300 }]);
      await expect.poll(top).toBe(380);
      expect(onClose).not.toHaveBeenCalled();
    });

    test("down from half height closes it", async () => {
      const { grab, onClose } = await mountSheet();
      const start = pointIn(grab);
      await swipe([start, { ...start, y: start.y + 40 }, { ...start, y: 600 }]);
      await expect.poll(() => onClose.mock.calls.length).toBe(1);
    });

    test("a short swipe leaves it where it was", async () => {
      const { grab, top, onClose } = await mountSheet();
      const start = pointIn(grab);
      await swipe([start, { ...start, y: start.y + 12 }]);
      await swipe([start, { ...start, y: start.y - 12 }]);
      // The sheet follows the finger and goes back.
      await expect.poll(top).toBe(380);
      expect(onClose).not.toHaveBeenCalled();
    });

    test("a swipe in its content scrolls the content only", async () => {
      const { screen, top, onClose } = await mountSheet();
      const text = screen.getByText("The entry").element();
      const start = pointIn(text);
      await swipe([start, { ...start, y: start.y - 60 }, { ...start, y: 200 }]);
      await swipe([start, { ...start, y: start.y + 60 }, { ...start, y: 800 }]);
      expect(top()).toBe(380);
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
