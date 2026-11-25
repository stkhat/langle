// Renders every UI surface in every interface language and measures what translations
// break (measure.ts): run with `npx playwright test -c scripts/ui-render` after
// `wxt build --mode check`; then `node scripts/ui-render/summarize.ts`. Results and
// screenshots go to $UI_RENDER_OUT (default reports/ui-render). LOCALES=de,ar narrows it.
import fs from "node:fs";
import path from "node:path";
import type { BrowserContext, Locator, Page } from "@playwright/test";
import {
  expect,
  openPopupFor,
  sendToBackground,
  setupPage,
  test,
} from "../../e2e/fixtures";
import {
  COLD_LOAD,
  ON_TIME,
  openArticle,
  pointOn,
  saveTerm,
  showNewWords,
} from "../../e2e/page";
import { routeYouTube, YOUTUBE_WATCH } from "../../e2e/sites";
import { uiText, type UiText } from "../../e2e/ui-text";
import { measure, type Measured } from "./measure";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.resolve(
  ROOT,
  process.env.UI_RENDER_OUT ?? "reports/ui-render",
);
const LOCALES = (
  process.env.LOCALES?.split(",") ??
  fs
    .readdirSync(path.join(ROOT, "src/i18n/locales"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
).sort();

const PHONE = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
};

/** The pair a locale is seen with: its own meanings where a pack exists. */
const nativeOf = (code: string) =>
  fs.existsSync(path.join(ROOT, `data/packs/en-${code}`)) ? code : "ja";

class Run {
  results: Record<string, Measured & { shot: string }> = {};
  console: string[] = [];
  readonly code: string;
  readonly layout: string;
  constructor(code: string, layout: string) {
    this.code = code;
    this.layout = layout;
  }
  watch(context: BrowserContext) {
    context.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning")
        this.console.push(`${m.type()}: ${m.text().slice(0, 300)}`);
    });
    context.on("weberror", (e) =>
      this.console.push(`uncaught: ${String(e.error()).slice(0, 300)}`),
    );
  }
  async snap(
    page: Page,
    surface: string,
    { scope, clip }: { scope: "page" | "langle"; clip?: Locator },
  ) {
    const m = await page.evaluate(measure, scope);
    const file = `${this.code}-${this.layout}-${surface}.png`;
    fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });
    const shot = path.join(OUT, "shots", file);
    if (clip) await clip.screenshot({ path: shot });
    else await page.screenshot({ path: shot, fullPage: scope === "page" });
    this.results[surface] = { ...m, shot: file };
  }
  save() {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(
      path.join(OUT, `${this.code}-${this.layout}.json`),
      JSON.stringify(
        {
          code: this.code,
          layout: this.layout,
          results: this.results,
          console: this.console,
        },
        null,
        1,
      ),
    );
  }
}

/** Runs `step`, keeping going (and noting it) when a surface cannot be reached. */
async function attempt(run: Run, name: string, step: () => Promise<void>) {
  try {
    await step();
  } catch (error) {
    run.console.push(`step ${name} failed: ${String(error).slice(0, 400)}`);
  }
}

async function useLocale(
  context: BrowserContext,
  extensionId: string,
  code: string,
) {
  await sendToBackground(context, extensionId, {
    type: "setSettings",
    patch: { interfaceLanguage: code },
  });
}

/**
 * A phone's touch screen on `page`: the extension pages pick their phone layout from
 * the pointer (`TOUCH_QUERY`), which the persistent context does not emulate for them.
 */
async function asPhone(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 5,
  });
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "hover", value: "none" },
      { name: "pointer", value: "coarse" },
      { name: "any-hover", value: "none" },
      { name: "any-pointer", value: "coarse" },
    ],
  });
  // The page follows the pointer on its next frames.
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );
}

async function extensionPage(
  context: BrowserContext,
  extensionId: string,
  file: string,
  code: string,
  phone = false,
) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${file}`);
  // After the load: Playwright sets its own emulation on navigation.
  if (phone) await asPhone(page);
  await expect(page.locator("html")).toHaveAttribute("lang", code);
  await page.locator("#app > *").first().waitFor();
  return page;
}

/** Settings: every section; on a phone the list and each pushed section. */
async function settings(
  run: Run,
  context: BrowserContext,
  extensionId: string,
  phone: boolean,
) {
  const page = await extensionPage(
    context,
    extensionId,
    "options.html",
    run.code,
    phone,
  );
  await expect(page.getByRole("navigation")).toBeVisible(COLD_LOAD);
  if (process.env.DEBUG_MEDIA)
    run.console.push(
      "media " +
        (await page.evaluate(() =>
          JSON.stringify({
            touch: matchMedia("(hover: none) and (pointer: coarse)").matches,
            w: innerWidth,
            tp: navigator.maxTouchPoints,
          }),
        )),
    );
  await run.snap(page, "settings", { scope: "page" });
  if (!phone) return page.close();
  const rows = await page.getByRole("navigation").getByRole("button").count();
  for (let i = 0; i < rows; i++) {
    await page.reload();
    await asPhone(page);
    await expect(page.getByRole("navigation")).toBeVisible(COLD_LOAD);
    await page.getByRole("navigation").getByRole("button").nth(i).click();
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await run.snap(page, `settings-${i}`, { scope: "page" });
  }
  await page.close();
}

async function wordList(
  run: Run,
  context: BrowserContext,
  extensionId: string,
  t: UiText,
) {
  for (const [key, status] of [
    ["creativity", "learning"],
    ["figure out", "learning"],
    ["tedious", "known"],
    ["sourdough", "learning"],
  ] as const)
    await saveTerm(context, extensionId, key, status);
  const page = await extensionPage(
    context,
    extensionId,
    "wordlist.html",
    run.code,
    run.layout === "phone",
  );
  const list = page.getByRole("region", { name: t("wordlist.list") });
  await expect(list).toBeVisible(COLD_LOAD);
  await expect(list.getByRole("button").first()).toBeVisible(COLD_LOAD);
  await run.snap(page, "wordlist", { scope: "page" });
  await list.getByRole("button").first().click();
  await run.snap(page, "wordlist-details", { scope: "page" });
  await page.close();
}

async function article(
  run: Run,
  context: BrowserContext,
  extensionId: string,
  t: UiText,
) {
  const page = await openArticle(context);
  const dictionary = page.getByRole("complementary", {
    name: t("dict.title"),
  });
  const details = page.getByRole("button", { name: t("hover.details") });

  await attempt(run, "hover", async () => {
    const at = await pointOn(page, "tangy");
    await page.mouse.move(at.x, at.y);
    await expect(details).toBeVisible(COLD_LOAD);
    await run.snap(page, "hover", { scope: "langle" });
    await page.mouse.click(at.x, at.y);
    await expect(dictionary).toBeVisible();
    await run.snap(page, "dict", { scope: "langle" });
    await page.keyboard.press("Escape");
  });

  await attempt(run, "dict-senses", async () => {
    const at = await pointOn(page, "rush");
    await page.mouse.move(at.x, at.y);
    await expect(details).toBeVisible();
    await page.mouse.click(at.x, at.y);
    await expect(dictionary.getByRole("heading").first()).toBeVisible();
    await run.snap(page, "dict-senses", { scope: "langle" });
    await page.keyboard.press("Escape");
  });

  await attempt(run, "phrase", async () => {
    await pointOn(page, "rise and fall");
    await page.evaluate(() => {
      const walker = document.createTreeWalker(
        document.querySelector("article")!,
        NodeFilter.SHOW_TEXT,
      );
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const start = node.data.indexOf("rise and");
        if (start < 0) continue;
        const end = node.data.indexOf("fall", start) + 4;
        getSelection()!.setBaseAndExtent(node, start, node, end);
        return;
      }
    });
    const add = page.getByRole("button", {
      name: t("hover.addLearning"),
      exact: true,
    });
    await expect(add).toBeVisible();
    await run.snap(page, "hover-phrase", { scope: "langle" });
    await add.click();
    await page.evaluate(() => getSelection()!.removeAllRanges());
    const at = await pointOn(page, "rise and fall");
    await page.mouse.move(at.x + 10, at.y);
    await expect(details).toBeVisible();
    await page.mouse.click(at.x + 10, at.y);
    await expect(dictionary).toBeVisible();
    await run.snap(page, "dict-phrase", { scope: "langle" });
    await page.keyboard.press("Escape");
  });

  await attempt(run, "popup", async () => {
    const popup = await openPopupFor(context, extensionId, page);
    await expect(
      popup.getByText(t("saveAll.scope.page"), { exact: true }),
    ).toBeVisible(COLD_LOAD);
    const body = popup.locator("#app > *").first();
    await run.snap(popup, "popup", { scope: "page", clip: body });
    await popup.getByRole("button", { name: t("saveAll.addLearning") }).click();
    await expect(
      popup.getByRole("button", { name: t("saveAll.undo") }),
    ).toBeVisible();
    await run.snap(popup, "popup-saved", { scope: "page", clip: body });
    await popup.getByRole("button", { name: t("saveAll.undo") }).click();
    await expect(
      popup.getByRole("button", { name: t("saveAll.addLearning") }),
    ).toBeVisible();
    const closed = popup.waitForEvent("close");
    await popup.getByRole("button", { name: t("popup.showWords") }).click();
    await closed;
    const panel = page.getByRole("complementary", {
      name: t("page.words.panel"),
    });
    await expect(panel.locator("[data-word-row]").first()).toBeVisible();
    await run.snap(page, "page-words", { scope: "langle" });
  });
  await page.close();
}

async function youtube(run: Run, context: BrowserContext, t: UiText) {
  await routeYouTube(context);
  const page = await context.newPage();
  await page.goto(YOUTUBE_WATCH);
  const transcript = page.getByRole("complementary", { name: t("app.name") });
  const line = "Mara found an extraordinary fossil of pure creativity";
  await transcript
    .getByRole("button", { name: line })
    .click({ position: ON_TIME, timeout: 20_000 });
  const inVideo = page
    .locator("langle-video-player")
    .getByRole("region", { name: t("video.subtitle") });
  await expect(inVideo).toContainText(line);
  await page.evaluate(() => document.querySelector("video")!.pause());
  await run.snap(page, "video", { scope: "langle" });

  await attempt(run, "video-hover", async () => {
    const word = inVideo.getByText("creativity", { exact: true });
    await word.hover();
    await expect(
      page.getByRole("button", { name: t("hover.details"), exact: true }),
    ).toBeVisible(COLD_LOAD);
    await run.snap(page, "video-hover", { scope: "langle" });
    await word.click();
    await expect(
      page.getByRole("complementary", { name: t("dict.window") }),
    ).toBeVisible();
    await run.snap(page, "video-dict", { scope: "langle" });
    await page.keyboard.press("Escape");
  });

  await attempt(run, "video-menu", async () => {
    await page.getByRole("button", { name: t("video.menu") }).click();
    await expect(
      page.getByRole("dialog", { name: t("video.menu") }),
    ).toBeVisible();
    await run.snap(page, "video-menu", { scope: "langle" });
    await page.keyboard.press("Escape");
  });

  await attempt(run, "video-words", async () => {
    await transcript.getByRole("tab", { name: t("kind.words") }).click();
    await expect(
      transcript.getByRole("group", { name: t("words.filter") }),
    ).toBeVisible();
    await run.snap(page, "video-words", { scope: "langle" });
  });
  await page.close();
}

for (const code of LOCALES) {
  const t = uiText(code);
  const native = code === "en" ? "ja" : nativeOf(code);

  for (const layout of ["desktop", "phone"] as const)
    test.describe(`${code} ${layout}`, () => {
      if (layout === "phone") test.use(PHONE);

      test.describe("set up", () => {
        test.use({ startPair: ["en", native] });
        test("surfaces", async ({ context, extensionId }) => {
          test.setTimeout(240_000);
          const run = new Run(code, layout);
          run.watch(context);
          await showNewWords(context, extensionId);
          await useLocale(context, extensionId, code);
          await attempt(run, "settings", () =>
            settings(run, context, extensionId, layout === "phone"),
          );
          await attempt(run, "notices", async () => {
            const page = await extensionPage(
              context,
              extensionId,
              "notices.html",
              code,
              layout === "phone",
            );
            await run.snap(page, "notices", { scope: "page" });
            await page.close();
          });
          await attempt(run, "wordlist", () =>
            wordList(run, context, extensionId, t),
          );
          if (layout === "desktop") {
            await attempt(run, "article", () =>
              article(run, context, extensionId, t),
            );
            await attempt(run, "youtube", () => youtube(run, context, t));
          }
          run.save();
        });
      });

      test.describe("setup", () => {
        test.use({
          startPair: null,
          // eslint-disable-next-line no-empty-pattern
          beforeInstall: async ({}, use) => {
            await use(async (context) => {
              // The setup starts in the browser's language: this locale.
              await context.addInitScript((code) => {
                const api = (
                  globalThis as unknown as {
                    chrome?: { i18n?: { getUILanguage(): string } };
                  }
                ).chrome;
                if (api?.i18n)
                  Object.defineProperty(api.i18n, "getUILanguage", {
                    value: () => code,
                  });
              }, code);
            });
          },
        });
        test("setup", async ({ context, extensionId }) => {
          test.setTimeout(120_000);
          const run = new Run(code, `${layout}-setup`);
          run.watch(context);
          const setup = await setupPage(context);
          await setup.reload();
          if (layout === "phone") await asPhone(setup);
          await expect(setup.locator("html")).toHaveAttribute("lang", code);
          await expect(
            setup.getByRole("button", { name: t("setup.consent.agree") }),
          ).toBeVisible();
          await run.snap(setup, "consent", { scope: "page" });
          await attempt(run, "popup-setup", async () => {
            const popup = await context.newPage();
            await popup.goto(`chrome-extension://${extensionId}/popup.html`);
            if (layout === "phone") await asPhone(popup);
            await expect(
              popup.getByRole("button", { name: t("popup.setup.review") }),
            ).toBeVisible();
            await run.snap(popup, "popup-setup", {
              scope: "page",
              clip: popup.locator("#app > *").first(),
            });
            await popup.close();
          });
          await setup.bringToFront();
          await setup
            .getByRole("button", { name: t("setup.consent.agree") })
            .click();
          await setup
            .getByLabel(t("setup.languages.native"))
            .selectOption({ value: code });
          await setup
            .getByLabel(t("setup.languages.learning"))
            .selectOption({ value: code === "en" ? "es" : "en" });
          await expect(setup.locator("html")).toHaveAttribute("lang", code);
          await run.snap(setup, "languages", { scope: "page" });
          run.save();
        });
      });
    });
}
