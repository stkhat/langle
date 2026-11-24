// The `phone` project (playwright.config.ts): a 390 × 844 touch screen with an Android
// user agent, as the mobile app's web view. Articles: touch mode, the dictionary sheet.
// On the fake m.youtube.com, the MAIN-world hook catches the player's caption request and
// Langle's parts go where the mobile layout puts them, in touch mode: the subtitle in a
// band pinned under the player, the transcript under it, the sheet for a tapped word.
// Turned to landscape in fullscreen: the subtitle over the video, a word's panel at the
// right, or the transcript's column beside the narrowed video.
import type { BrowserContext, Page } from "@playwright/test";
import en from "../src/i18n/locales/en.json" with { type: "json" };
import { test, expect } from "./fixtures";
import {
  COLD_LOAD,
  highlighted,
  ON_TIME,
  openArticle,
  showNewWords,
} from "./page";
import { checkSettings } from "./check-settings";
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

/** The fake m.youtube.com, played from LINE's card in the transcript. */
async function openMobileWatch(context: BrowserContext, extensionId: string) {
  await showNewWords(context, extensionId);
  await routeMobileYouTube(context);
  const page = await context.newPage();
  await page.goto(YOUTUBE_MOBILE_WATCH);
  const transcript = page
    .locator("langle-transcript")
    .getByRole("region", { name: en["video.transcript"] });
  await transcript
    .getByRole("button", { name: LINE })
    .click({ position: ON_TIME, timeout: COLD_LOAD.timeout });
  const subtitle = page.locator("langle-video-below").getByRole("region", {
    name: en["video.subtitle"],
  });
  await expect(subtitle).toContainText(LINE);
  const paused = () =>
    page.locator("video").evaluate((v: HTMLVideoElement) => v.paused);
  return { page, transcript, subtitle, paused };
}

/** Langle's "Paused" over the video while it holds the video paused. */
const pausedPill = (page: Page) =>
  page
    .locator("langle-video-player, langle-video")
    .getByRole("status")
    .filter({ hasText: en["video.paused"] });

const closeSheet = (page: Page) =>
  sheet(page).getByRole("button", { name: en["dict.close"] }).tap();

test("m.youtube.com: the subtitle pinned under the player, the transcript under it", async ({
  context,
  extensionId,
}) => {
  const { page, transcript, subtitle } = await openMobileWatch(
    context,
    extensionId,
  );
  // Held on the line while the layout is measured.
  await page.locator("video").evaluate((v: HTMLVideoElement) => v.pause());
  // Touch mode: the subtitle leaves the video for the band under it, pinned there.
  const player = (await page.locator("#movie_player").boundingBox())!;
  const band = (await subtitle.boundingBox())!;
  expect(band.y).toBeCloseTo(player.y + player.height, 0);
  expect(band.width).toBe(390);
  // Pinned: it stays under the player while the page scrolls under it.
  expect(await page.evaluate(() => (scrollTo(0, 400), scrollY))).toBe(400);
  await expect
    .poll(async () => (await subtitle.boundingBox())!.y)
    .toBeCloseTo(player.y + player.height, 0);
  await page.evaluate(() => scrollTo(0, 0));
  // The light band's highlight colors, not the ones over the video.
  await expect(subtitle.getByText("creativity", { exact: true })).toHaveCSS(
    "box-shadow",
    /rgb\(47, 111, 228\)/,
  );
  await expect(
    page.locator("langle-video-player").getByRole("region", {
      name: en["video.subtitle"],
    }),
  ).toHaveCount(0);
  await expect(page.locator("#ytp-caption-window-container")).toBeHidden();
  // The transcript under the subtitle, its playing card marked; it folds.
  const list = (await transcript.boundingBox())!;
  expect(list.y).toBeGreaterThanOrEqual(band.y + band.height - 1);
  await expect(transcript.getByRole("button", { name: LINE })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await transcript
    .getByRole("button", { name: en["video.hideTranscript"] })
    .tap();
  await expect(transcript.getByRole("button", { name: LINE })).toHaveCount(0);
});

test("m.youtube.com: a tap on a word opens its sheet under the subtitle and pauses", async ({
  context,
  extensionId,
}) => {
  const { page, subtitle, paused } = await openMobileWatch(
    context,
    extensionId,
  );
  await subtitle.getByText("creativity", { exact: true }).tap();
  await expect(
    sheet(page).getByRole("heading", { name: "creativity" }),
  ).toBeVisible(COLD_LOAD);
  await expect.poll(paused).toBe(true);
  await expect(pausedPill(page)).toBeVisible();
  const band = (await subtitle.boundingBox())!;
  const box = (await sheet(page).boundingBox())!;
  // Rounded to a whole pixel.
  expect(Math.abs(box.y - (band.y + band.height))).toBeLessThanOrEqual(0.5);
  const learning = sheet(page).getByRole("button", {
    name: en["status.learning"],
    exact: true,
  });
  expect((await learning.boundingBox())!.height).toBe(44);
  await learning.tap();
  await expect(learning).toHaveAttribute("aria-pressed", "true");
  await closeSheet(page);
  await expect(sheet(page)).toHaveCount(0);
  await expect.poll(paused).toBe(false);
  await expect(pausedPill(page)).toHaveCount(0);
});

test("m.youtube.com: a long-press across words on the subtitle opens the phrase's sheet", async ({
  context,
  extensionId,
}) => {
  const { page, subtitle, paused } = await openMobileWatch(
    context,
    extensionId,
  );
  const word = (text: string) =>
    subtitle.getByText(text, { exact: true }).boundingBox();
  const from = (await word("evidence"))!;
  const to = (await word("human"))!;
  const cdp = await context.newCDPSession(page);
  const touch = (
    type: "touchStart" | "touchMove" | "touchEnd",
    points: { x: number; y: number }[],
  ) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  // "human" may wrap onto the next line: the finger goes where it is.
  await touch("touchStart", [{ x: from.x + 4, y: from.y + from.height / 2 }]);
  await page.waitForTimeout(800);
  await touch("touchMove", [
    { x: to.x + to.width - 4, y: to.y + to.height / 2 },
  ]);
  await touch("touchEnd", []);
  await expect(
    sheet(page).getByRole("heading", { name: "evidence of human" }),
  ).toBeVisible(COLD_LOAD);
  await expect(
    sheet(page).getByText(en["lookup.status.selected"]),
  ).toBeVisible();
  await expect.poll(paused).toBe(true);
  await closeSheet(page);
  await expect.poll(paused).toBe(false);
});

/** The phone turned to landscape and the player's container put in fullscreen, as m.youtube.com does. */
async function landscapeFullscreen(page: Page) {
  await page.setViewportSize({ width: 844, height: 390 });
  await page
    .locator("#player-container-id")
    .evaluate((el) => el.requestFullscreen());
  const subtitle = page.locator("langle-video").getByRole("region", {
    name: en["video.subtitle"],
  });
  await expect(subtitle).toContainText(LINE);
  return subtitle;
}

test("m.youtube.com in fullscreen: the subtitle over the video, L, and a tapped word's panel at the right", async ({
  context,
  extensionId,
}) => {
  const { page, paused } = await openMobileWatch(context, extensionId);
  const subtitle = await landscapeFullscreen(page);
  const band = (await subtitle.boundingBox())!;
  expect(390 - (band.y + band.height)).toBeCloseTo(28, 0);
  await expect(
    page.locator("langle-video").getByRole("button", {
      name: en["video.openLangle"],
    }),
  ).toBeVisible();
  await expect(page.locator("langle-video-sidebar")).toHaveCount(0);
  await subtitle.getByText("creativity", { exact: true }).tap();
  const panel = sheet(page);
  await expect(panel.getByRole("heading", { name: "creativity" })).toBeVisible(
    COLD_LOAD,
  );
  await expect.poll(paused).toBe(true);
  const box = (await panel.boundingBox())!;
  expect([box.y, 844 - (box.x + box.width), box.width]).toEqual([12, 56, 300]);
  const pill = (await pausedPill(page).boundingBox())!;
  expect([pill.x, pill.y]).toEqual([56, 16]);
  // The subtitle keeps its width under the panel.
  expect((await subtitle.boundingBox())!.width).toBe(band.width);
});

test("m.youtube.com in fullscreen with the transcript at the right: the column, the video beside it, the dictionary inside", async ({
  context,
  extensionId,
}) => {
  const { page } = await openMobileWatch(context, extensionId);
  expect(
    await checkSettings(page, "set", { phoneFullscreenTranscript: "right" }),
  ).toMatchObject({ ok: true });
  const subtitle = await landscapeFullscreen(page);
  const column = page.locator("langle-video-sidebar");
  await expect(column).toHaveCount(1);
  const box = (await column.boundingBox())!;
  expect([844 - (box.x + box.width), box.y, box.width]).toEqual([44, 16, 300]);
  // The video narrowed beside it, and inside its box.
  await expect
    .poll(async () => {
      const v = (await page.locator("video").boundingBox())!;
      return v.x + v.width <= 844 - 356 + 1;
    })
    .toBe(true);
  await expect(
    page.locator("langle-transcript").getByRole("button", { name: LINE }),
  ).toHaveAttribute("aria-current", "true");
  await subtitle.getByText("creativity", { exact: true }).tap();
  const panel = sheet(page);
  await expect(panel.getByRole("heading", { name: "creativity" })).toBeVisible(
    COLD_LOAD,
  );
  const inside = (await panel.boundingBox())!;
  expect([inside.x, inside.width]).toEqual([box.x, 300]);
  const pill = (await pausedPill(page).boundingBox())!;
  expect([pill.x, pill.y]).toEqual([12, 12]);
  await panel.getByRole("button", { name: en["video.backToTranscript"] }).tap();
  await expect(panel).toHaveCount(0);
});
