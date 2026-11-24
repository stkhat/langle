// The `phone` project (playwright.config.ts): a 390 × 844 touch screen with an Android
// user agent, as the mobile app's web view. On the fake m.youtube.com, the MAIN-world
// hook catches the player's caption request and Langle's parts go where the mobile
// layout puts them. Touch mode is not wired yet (mobile-app.md M3d): the subtitle
// follows the desktop's setting.
import en from "../src/i18n/locales/en.json" with { type: "json" };
import { test, expect } from "./fixtures";
import { ON_TIME, showNewWords } from "./page";
import { routeMobileYouTube, YOUTUBE_MOBILE_WATCH } from "./sites";

/** "extraordinary" and "creativity" are New words. */
const LINE = "One is the extraordinary evidence of human creativity";

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
