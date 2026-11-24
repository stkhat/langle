// The `phone` project (playwright.config.ts): a 390 × 844 touch screen with an Android
// user agent, as the mobile app's web view. Articles: touch mode, the dictionary sheet.
// On the fake m.youtube.com, the MAIN-world hook catches the player's caption request and
// Langle's parts go where the mobile layout puts them. (The video UI's touch mode is not
// wired yet, mobile-app.md M3d: the subtitle follows the desktop's setting.)
import type { Page } from "@playwright/test";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import { test, expect } from "./fixtures";
import {
  COLD_LOAD,
  highlighted,
  ON_TIME,
  openArticle,
  showNewWords,
} from "./page";
import { routeMobileYouTube, YOUTUBE_MOBILE_WATCH } from "./sites";

/** A point a little in from the left edge of `text` in the article, scrolled into view. */
function wordPoint(page: Page, text: string) {
  return page.evaluate((text) => {
    const walker = document.createTreeWalker(
      document.querySelector("article")!,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const i = node.data.indexOf(text);
      if (i < 0) continue;
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + text.length);
      node.parentElement!.scrollIntoView({ block: "start" });
      const r = range.getBoundingClientRect();
      return { x: r.left + 3, y: r.top + r.height / 2, right: r.right - 3 };
    }
    throw new Error(`"${text}" not found`);
  }, text);
}

const sheet = (page: Page) =>
  page.getByRole("complementary", { name: en["dict.title"] });

test("a tap opens the word's sheet, and Learning saves the word", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  const loaf = await wordPoint(page, "loaf");
  await page.touchscreen.tap(loaf.x, loaf.y);
  await expect(sheet(page).getByRole("heading", { name: "loaf" })).toBeVisible(
    COLD_LOAD,
  );
  await expect(sheet(page).getByText(en["lookup.status.new"])).toBeVisible();
  // Touch mode from the phone's pointer: the sheet across the bottom, not the panel. (The
  // fixture has no viewport meta tag: the phone lays it out 980px wide, zoomed out.)
  const { width, height } = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  const box = (await sheet(page).boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(width);
  expect(box.y).toBeCloseTo(Math.round(height * 0.45), 0);
  await sheet(page)
    .getByRole("button", { name: en["status.learning"], exact: true })
    .tap();
  await expect
    .poll(() => highlighted(page, "langle-learning"))
    .toContain("loaf");
});

test("a long-press across two words opens their phrase's sheet", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const page = await openArticle(context);
  const from = await wordPoint(page, "tangy taste");
  const to = await wordPoint(page, "taste");
  const cdp = await context.newCDPSession(page);
  const touch = (
    type: "touchStart" | "touchMove" | "touchEnd",
    points: { x: number; y: number }[],
  ) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  // Down on the first word, held, then dragged to the end of the second: what Langle
  // sees of a phone's long-press. Desktop Chromium has no touch text selection, so the
  // selection the phone's own long-press leaves (part of each word) is made after it.
  await touch("touchStart", [{ x: from.x, y: from.y }]);
  await page.waitForTimeout(800);
  await touch("touchMove", [{ x: to.right, y: to.y }]);
  await touch("touchEnd", []);
  await page.evaluate(() => {
    const article = document.querySelector("article")!;
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const i = node.data.indexOf("tangy taste");
      if (i >= 0) getSelection()!.setBaseAndExtent(node, i + 1, node, i + 9);
    }
  });
  await expect(
    sheet(page).getByRole("heading", { name: "tangy taste" }),
  ).toBeVisible(COLD_LOAD);
  await expect(
    sheet(page).getByText(en["lookup.status.selected"]),
  ).toBeVisible();
  // Snapped to the whole words.
  expect(await page.evaluate(() => getSelection()!.toString())).toBe(
    "tangy taste",
  );
});

/** "extraordinary" and "creativity" are New words. */
const LINE = "Mara found an extraordinary fossil of pure creativity";

test("m.youtube.com: the subtitle shows with its highlights, the transcript below the video", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  await routeMobileYouTube(context);
  const page = await context.newPage();
  await page.goto(YOUTUBE_MOBILE_WATCH);

  // No side column on the phone: the transcript opens the area under the player.
  const transcript = page.getByRole("complementary", {
    name: en["app.name"],
  });
  await expect(transcript).toBeVisible();
  expect(
    await page
      .locator(".watch-below-the-player")
      .evaluate((below) => below.querySelector("langle-transcript") !== null),
  ).toBe(true);
  const player = (await page.locator("#movie_player").boundingBox())!;
  const column = (await transcript.boundingBox())!;
  expect(column.y).toBeGreaterThanOrEqual(player.y + player.height);
  expect(column.width).toBeLessThanOrEqual(390);

  await transcript
    .getByRole("button", { name: LINE })
    .click({ position: ON_TIME });
  const subtitle = page.locator("langle-video-player").getByRole("region", {
    name: en["video.subtitle"],
  });
  await expect(subtitle).toContainText(LINE);
  await expect(subtitle.getByText("creativity", { exact: true })).toHaveCSS(
    "box-shadow",
    /rgb\(141, 180, 255\)/,
  );
  await expect(page.locator("#ytp-caption-window-container")).toBeHidden();
});
