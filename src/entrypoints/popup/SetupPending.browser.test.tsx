import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-preact";
import { SetupPending } from "./SetupPending";

afterEach(cleanup);

it.each([
  [
    "consent",
    "It needs your agreement on how it handles your data.",
    "Review and agree",
  ],
  ["languages", "Choose your languages to start.", "Choose languages"],
] as const)(
  "shows only what is left of the %s, with a gray mark",
  async (stage, text, label) => {
    const review = vi.fn();
    const screen = await render(<SetupPending stage={stage} review={review} />);
    await expect
      .element(screen.getByText("Langle hasn’t started"))
      .toBeVisible();
    await expect.element(screen.getByText(text)).toBeVisible();
    expect(screen.container.querySelectorAll("button")).toHaveLength(1);
    expect(
      screen.container.querySelector<SVGElement>("[data-langle-mark] svg")!
        .style.filter,
    ).not.toBe("none");
    await screen.getByRole("button", { name: label }).click();
    expect(review).toHaveBeenCalledOnce();
  },
);
