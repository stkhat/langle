// Articles in touch mode (mock MobileArticle*): real touches through CDP, Chromium only.
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  onTestFinished,
} from "vitest";
import { commands, page } from "vitest/browser";
import {
  cleanUp,
  dictionary,
  pointAt,
  rangeOfText,
  rectOf,
  selectText,
  setup,
} from "../../testing/article";
import type { Point } from "../../testing/mouse";
import { canTouch, longPress, tap } from "../../testing/touch";

const ARTICLE = `
  <p>They knead the dough and bake loaves.</p>
  <p>It can feel tedious at first. Once you figure out a schedule, it is tedious no more.</p>
  <p>So you can trace each rise and fall back to its cause.</p>
  <p>one two three four five six seven eight nine ten</p>
  <p>Read <a href="#guide">the tedious guide</a> before you start.</p>`;

beforeAll(async () => {
  await page.viewport(390, 844);
});
afterEach(cleanUp);

const quiet = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A point a little in from the left edge of `text`, in the middle of its line. */
function on(root: Node, text: string, nth = 0): Point {
  const rect = rectOf(root, text, nth);
  return { x: rect.left + 3, y: rect.top + rect.height / 2 };
}

const heading = (name: string) =>
  dictionary().getByRole("heading", { name, exact: true });

describe.runIf(canTouch)("articles in touch mode", () => {
  it("shows no hover card", async () => {
    const { root } = await setup(ARTICLE, { touch: true });
    await pointAt(root, "tedious");
    await quiet(500);
    expect(page.getByRole("button", { name: "Details" }).query()).toBeNull();
  });

  it("opens the word's sheet on a tap; a tap on another word switches it; a tap away closes it", async () => {
    const { root } = await setup(ARTICLE, { touch: true });
    await tap(on(root, "tedious"));
    await expect.element(heading("tedious")).toBeVisible();
    await expect
      .element(dictionary().getByText("New · not saved"))
      .toBeVisible();
    // Mock MobileArticleDictionary: the sheet from 45% of the height to the bottom.
    const box = dictionary().element().getBoundingClientRect();
    expect(box.top).toBe(Math.round(844 * 0.45));
    expect(box.bottom).toBe(844);
    expect(box.width).toBe(390);

    await tap(on(root, "dough"));
    await expect.element(heading("dough")).toBeVisible();
    expect(heading("tedious").query()).toBeNull();

    const blank = rectOf(root, "cause.");
    // The article's left padding.
    await tap({ x: 5, y: blank.top + blank.height / 2 });
    await expect.poll(() => dictionary().query()).toBeNull();
  });

  it("Learning in the sheet saves the tapped word", async () => {
    const { root, background } = await setup(ARTICLE, { touch: true });
    await tap(on(root, "tedious"));
    await dictionary().getByRole("button", { name: "Learning" }).click();
    await expect
      .element(dictionary().getByRole("button", { name: "Learning" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(background.sent("saveTerm")).toMatchObject([
      { key: "tedious", status: "learning" },
    ]);
  });

  it("snaps the phone's selection once it rests and opens the phrase's sheet", async () => {
    const { root, background } = await setup(ARTICLE, { touch: true });
    selectText(root, "rise", 2, "fall", 2);
    // Still settling (a finger on a handle): nothing yet.
    await quiet(250);
    expect(dictionary().query()).toBeNull();
    await expect.element(heading("rise and fall")).toBeVisible();
    await expect
      .element(dictionary().getByText("Selected · not saved"))
      .toBeVisible();
    expect(getSelection()!.toString()).toBe("rise and fall");
    // No card over the words.
    expect(page.getByRole("button", { name: "Details" }).query()).toBeNull();

    await dictionary().getByRole("button", { name: "Learning" }).click();
    await expect
      .element(
        dictionary().getByRole("button", { name: "Learning", pressed: true }),
      )
      .toBeVisible();
    expect(background.sent("saveTerm")).toMatchObject([
      { key: "rise and fall", kind: "phrase", status: "learning" },
    ]);
    expect(getSelection()!.isCollapsed).toBe(true);
  });

  it("snaps a selection that rests while the finger is still down", async () => {
    // WebKit on iOS: a handle's drag sends the page no end of the press.
    const { root } = await setup(ARTICLE, { touch: true });
    await commands.touch([{ type: "touchStart", points: [on(root, "rise")] }]);
    onTestFinished(() => commands.touch([{ type: "touchEnd", points: [] }]));
    selectText(root, "rise", 2, "fall", 2);
    await expect.element(heading("rise and fall")).toBeVisible();
  });

  it("leaves a selection of more than 8 words alone", async () => {
    const { root } = await setup(ARTICLE, { touch: true });
    selectText(root, "one", 1, "ten", 2);
    const selected = getSelection()!.toString();
    await quiet(900);
    expect(dictionary().query()).toBeNull();
    expect(getSelection()!.toString()).toBe(selected);
  });

  it("opens a word in a link on a long-press without following the link; a tap follows it", async () => {
    const { root } = await setup(ARTICLE, { touch: true });
    const link = root.querySelector("a")!;
    let clicks = 0;
    link.addEventListener("click", (event) => {
      clicks++;
      event.preventDefault();
    });

    // On a touch screen the link's text is Langle's to long-press: no system menu, no
    // selection (WebKit on iOS takes such a press over).
    const rules = document.adoptedStyleSheets.flatMap((sheet) =>
      [...sheet.cssRules].map((rule) => rule.cssText),
    );
    expect(rules).toContainEqual(
      expect.stringMatching(/hover: none.*a\[href\].*user-select: none/s),
    );

    await longPress([on(root, "tedious", 2)]);
    await expect.element(heading("tedious")).toBeVisible();
    await quiet(200);
    expect(clicks).toBe(0);

    await tap(on(root, "guide"));
    await expect.poll(() => clicks).toBe(1);
    // The link took the tap: no sheet for its word.
    expect(heading("guide").query()).toBeNull();
  });

  it("scrolls the tapped word above the sheet", async () => {
    const { root } = await setup(
      `<div style="height: 700px"></div>
       <p>It can feel tedious at first.</p>
       <div style="height: 1200px"></div>`,
      { touch: true },
    );
    const before = rectOf(root, "tedious");
    expect(before.top).toBeGreaterThan(Math.round(844 * 0.45));
    await tap(on(root, "tedious"));
    await expect.element(heading("tedious")).toBeVisible();
    const sheetTop = dictionary().element().getBoundingClientRect().top;
    await expect
      .poll(() => rangeOfText(root, "tedious").getBoundingClientRect().bottom)
      .toBeLessThan(sheetTop - 16);
    expect(rectOf(root, "tedious").top).toBeGreaterThanOrEqual(16);
    scrollTo(0, 0);
  });
});
