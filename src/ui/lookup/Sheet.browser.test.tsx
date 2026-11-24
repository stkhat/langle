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
