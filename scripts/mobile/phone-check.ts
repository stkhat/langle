// The real m.youtube.com as a phone sees it, in desktop Chromium: the check build
// (`npm run build:check`) in a fresh profile with a phone's screen, touch and Android
// user agent, as the mobile app's web view. For each video (muted) it waits for the
// subtitle band, taps a highlighted word and waits for its sheet; for the first one it
// also turns to landscape in fullscreen, with the transcript's column at the right.
// Screenshots go to SHOT_DIR (default: the system's temp folder). At the end it prints
// the check build's error log (`langle:check-errors`) and clears it.
// Usage: npm run build:check && npx jiti scripts/mobile/phone-check.ts [videoId ...]
// (HEADED=1 shows the browser, CHANNEL=chrome uses Google Chrome, DEBUG=1 prints the
// page's errors and failed requests.)
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { connectBrowserCdp, freePort } from "../../e2e/error-collector";
import {
  mergeSettings,
  SETTINGS_KEY,
  SETTINGS_TIMES_KEY,
} from "../../src/core/settings";
import { CONSENT_VERSION, SETUP_KEY } from "../../src/core/setup";

/** The TED baseline and an auto-caption video (docs/notes: real-site test videos). */
const VIDEOS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["iG9CE55wbtY", "kaPgGH5HC0w"];
const EXTENSION = resolve(import.meta.dirname, "../../.output/langle-check");
const SHOTS = process.env.SHOT_DIR ?? tmpdir();
const WAIT = 90_000;
const PHONE = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
};

const log = (...parts: unknown[]) => console.log("[phone-check]", ...parts);

/** Asks the check build's content script on `page` for its error log. */
function errorLog(page: Page, action: "read" | "clear") {
  return page.evaluate(
    (action) =>
      new Promise<unknown>((done) => {
        const id = String(Math.random());
        const replies: unknown[] = [];
        addEventListener("message", (e: MessageEvent) => {
          if (
            e.data?.type === "langle:check-errors" &&
            e.data.reply &&
            e.data.id === id
          )
            replies.push(e.data);
        });
        postMessage({ type: "langle:check-errors", action, id }, "*");
        setTimeout(() => done(replies.length ? replies : "no answer"), 1000);
      }),
    action,
  );
}

/** Sets the check build's settings from `page` (src/check/settings-channel.ts). */
function setSettings(page: Page, settings: object) {
  return page.evaluate(
    (settings) =>
      new Promise<unknown>((done) => {
        const id = String(Math.random());
        addEventListener("message", (e: MessageEvent) => {
          if (
            e.data?.type === "langle:check-settings" &&
            e.data.reply &&
            e.data.id === id
          )
            done(e.data);
        });
        postMessage(
          { type: "langle:check-settings", action: "set", id, settings },
          "*",
        );
        setTimeout(() => done("no answer"), 5000);
      }),
    settings,
  );
}

/** Keeps every video on the page muted, also one the site makes later. */
const muteAll = (page: Page) =>
  page.addInitScript(() => {
    const mute = () =>
      document.querySelectorAll("video").forEach((v) => (v.muted = true));
    document.addEventListener("play", mute, true);
    document.addEventListener("volumechange", mute, true);
    setInterval(mute, 500);
  });

/** Taps the first highlighted word in the subtitle under the player; its text. */
async function tapHighlighted(page: Page): Promise<string> {
  const words = page.locator("langle-video-below [data-span]");
  await words.first().waitFor({ timeout: WAIT });
  const index = await words.evaluateAll((all) =>
    all.findIndex((el) => getComputedStyle(el).boxShadow !== "none"),
  );
  if (index < 0) throw new Error("No highlighted word in the subtitle");
  const word = words.nth(index);
  const text = (await word.textContent()) ?? "";
  await word.tap();
  return text;
}

const sheet = (page: Page) =>
  page.locator("langle-video").getByRole("complementary").first();

async function main() {
  const port = await freePort();
  const context = await chromium.launchPersistentContext("", {
    ...PHONE,
    channel: process.env.CHANNEL ?? "chromium",
    headless: !process.env.HEADED,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--remote-debugging-port=${port}`,
      "--enable-unsafe-extension-debugging",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const cdp = await connectBrowserCdp(port);
  try {
    const reply = await cdp.send("Extensions.loadUnpacked", {
      path: EXTENSION,
    });
    if (reply.error) throw new Error(reply.error.message);
  } finally {
    cdp.close();
  }
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  // As Start leaves a new install (e2e/fixtures.ts useStartPair), New shown.
  const values = mergeSettings({
    learningLang: "en",
    nativeLang: "ja",
    highlight: { new: true },
  });
  await worker.evaluate(
    async ([sync, local]) => {
      type Area = { set(items: object): Promise<void> };
      const { chrome: api } = globalThis as unknown as {
        chrome: { storage: { sync: Area; local: Area } };
      };
      await api.storage.sync.set(sync);
      await api.storage.local.set(local);
    },
    [
      { [SETTINGS_KEY]: values, [SETTINGS_TIMES_KEY]: { values, times: {} } },
      { [SETUP_KEY]: { consent: CONSENT_VERSION, languages: true } },
    ] as const,
  );
  for (const open of context.pages())
    if (open.url().includes("welcome")) await open.close();

  const page = await context.newPage();
  await muteAll(page);
  // The caption responses the player got: YouTube can answer an automated browser
  // with empty bodies, and then Langle has no lines to show.
  const captions: string[] = [];
  page.on("response", (r) => {
    if (!r.url().includes("/api/timedtext")) return;
    const url = new URL(r.url());
    void r
      .body()
      .catch(() => Buffer.alloc(0))
      .then((body) =>
        captions.push(
          `lang=${url.searchParams.get("lang")} pot=${url.searchParams.has("pot")}: ${r.status()}, ${body.length} B`,
        ),
      );
  });
  if (process.env.DEBUG) {
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning")
        log("console", m.type(), m.text().slice(0, 300));
    });
    page.on("pageerror", (e) => log("pageerror", e.message.slice(0, 300)));
    page.on("response", (r) => {
      if (r.status() >= 400) log("response", r.status(), r.url().slice(0, 200));
    });
    page.on("requestfailed", (r) =>
      log("requestfailed", r.url().slice(0, 160), r.failure()?.errorText),
    );
  }
  let failed = false;
  for (const [n, id] of VIDEOS.entries()) {
    try {
      if (n > 0) await page.setViewportSize(PHONE.viewport);
      captions.length = 0;
      await page.goto(`https://m.youtube.com/watch?v=${id}`);
      const word = await tapHighlighted(page);
      await sheet(page).waitFor({ timeout: WAIT });
      log(id, `tapped "${word}": sheet open`);
      await page.screenshot({ path: `${SHOTS}/phone-${id}-sheet.png` });
      await page.keyboard.press("Escape");
      if (n > 0) continue;
      // Landscape, fullscreen, the transcript's column at the right.
      log(
        id,
        "settings:",
        JSON.stringify(
          await setSettings(page, { phoneFullscreenTranscript: "right" }),
        ),
      );
      await page.setViewportSize({ width: 844, height: 390 });
      await page
        .locator("#player-container-id")
        .evaluate((el) => el.requestFullscreen());
      await page.locator("langle-video-sidebar").waitFor({ timeout: WAIT });
      await page.waitForTimeout(1500);
      const fit = await page.evaluate(() => {
        const video = document.querySelector("video")!.getBoundingClientRect();
        const column = document
          .querySelector("langle-video-sidebar")!
          .getBoundingClientRect();
        return { videoRight: video.right, columnLeft: column.left };
      });
      log(id, "fullscreen with the column:", JSON.stringify(fit));
      await page.screenshot({ path: `${SHOTS}/phone-${id}-landscape.png` });
      await setSettings(page, { phoneFullscreenTranscript: "off" });
      await page.evaluate(() => document.exitFullscreen());
    } catch (error) {
      failed = true;
      log(id, "FAILED:", error instanceof Error ? error.message : error);
      log(id, "caption responses:", captions.join("; ") || "none");
      log(
        id,
        "player:",
        await page.evaluate(() => {
          const player = document.querySelector("#movie_player") as
            | (HTMLElement & {
                getPlayerResponse?(): { playabilityStatus?: unknown };
                getPlayerState?(): number;
              })
            | null;
          const video = document.querySelector("video");
          return JSON.stringify({
            state: player?.getPlayerState?.(),
            playability: player?.getPlayerResponse?.()?.playabilityStatus,
            error: video?.error?.message ?? video?.error?.code,
            time: video?.currentTime,
          }).slice(0, 600);
        }),
      );
      await page.screenshot({ path: `${SHOTS}/phone-${id}-failed.png` });
    }
  }
  // Info entries are records (the packs' mirrors), not findings: counted only.
  const replies = await errorLog(page, "read");
  if (!Array.isArray(replies)) log("error log: no answer");
  else
    for (const { context: from, entries } of replies as {
      context: string;
      entries: { level: string; message: string; context: string }[];
    }[]) {
      const findings = entries.filter((entry) => entry.level !== "info");
      log(
        `error log (${from}): ${entries.length - findings.length} info, ${findings.length} findings`,
      );
      for (const entry of findings)
        log(`  ${entry.level} [${entry.context}] ${entry.message}`);
    }
  await errorLog(page, "clear");
  log("screenshots in", SHOTS);
  await context.close();
  if (failed) process.exitCode = 1;
}

await main();
