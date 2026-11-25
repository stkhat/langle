import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "vitest-browser-preact";
import type { TouchMode } from "../content/touch/touch-mode";
import { usePhoneLayout } from "./phone-layout";

afterEach(cleanup);

function Probe(props: { touch?: TouchMode }) {
  return <span>{usePhoneLayout(props.touch) ? "phone" : "desktop"}</span>;
}

/** A touch mode the test switches, as a device switched in DevTools would. */
function switchable(start: boolean) {
  let on = start;
  const listeners = new Set<(on: boolean) => void>();
  const mode: TouchMode = {
    on: () => on,
    watch(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    mode,
    listeners,
    set(next: boolean) {
      on = next;
      for (const listener of listeners) listener(next);
    },
  };
}

describe("usePhoneLayout", () => {
  it("is off on a desktop with a mouse", async () => {
    const screen = await render(<Probe />);
    await expect.element(screen.getByText("desktop")).toBeVisible();
  });

  it("follows touch mode on the page while mounted, and stops watching after", async () => {
    const touch = switchable(true);
    const screen = await render(<Probe touch={touch.mode} />);
    await expect.element(screen.getByText("phone")).toBeVisible();
    touch.set(false);
    await expect.element(screen.getByText("desktop")).toBeVisible();
    touch.set(true);
    await expect.element(screen.getByText("phone")).toBeVisible();
    await screen.unmount();
    expect(touch.listeners.size).toBe(0);
  });
});
