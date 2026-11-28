import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppHost } from "../core/app-host";
import { reportContentHeight } from "./content-height";

let body: HTMLElement;
let stop: () => void = () => {};
afterEach(() => {
  stop();
  body.remove();
});

describe("reportContentHeight", () => {
  it("tells the app the page's height, and again once it changes", async () => {
    body = document.body.appendChild(document.createElement("div"));
    body.style.cssText = "margin: 6px 0 4px; height: 300px;";
    const contentHeight = vi.fn<(height: number) => Promise<void>>(
      async () => {},
    );
    stop = reportContentHeight(body, { contentHeight } as unknown as AppHost);
    await expect
      .poll(
        () => (contentHeight.mock.calls.at(-1) as number[] | undefined)?.[0],
      )
      .toBe(310);
    body.style.height = "420.5px";
    await expect
      .poll(
        () => (contentHeight.mock.calls.at(-1) as number[] | undefined)?.[0],
      )
      .toBe(431);
    const calls = contentHeight.mock.calls.length;
    body.style.height = "420.4px";
    await new Promise((done) =>
      requestAnimationFrame(() => setTimeout(done, 50)),
    );
    // The same whole height is not told again.
    expect(contentHeight.mock.calls.length).toBe(calls);
  });

  it("does nothing outside the app", () => {
    body = document.body.appendChild(document.createElement("div"));
    stop = reportContentHeight(body, undefined);
    expect(stop).toBeTypeOf("function");
  });
});
