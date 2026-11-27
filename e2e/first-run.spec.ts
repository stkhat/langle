// A new install: it opens its setup and does nothing else — no download, no settings,
// nothing of a page — until the user agreed and chose the languages (ui.md "First-run
// consent"). Start then goes back to the page that was open before, reloads it only if
// Langle does not run there, and downloads the pair's data from the lock's mirrors
// (routed to data/packs/, pack-mirrors.ts), while the popup and Settings show it.
import type { BrowserContext, Page } from "@playwright/test";
import lock from "../src/core/packs/packs.lock.json" with { type: "json" };
import {
  openPopupFor,
  sendToBackground,
  setupPage,
  setupPages,
  testWithErrors,
} from "./fixtures";
import { mirrorRequests, releasePackMirrors } from "./pack-mirrors";
import { COLD_LOAD, highlighted, showNewWords } from "./page";
import { browserUiLocale, pageUiLocale, uiText } from "./ui-text";
import {
  NETFLIX_WATCH,
  routeNetflix,
  routeYouTube,
  YOUTUBE_WATCH,
} from "./sites";

const test = testWithErrors;
const expect = test.expect;

// Not set up, and the downloads held until the test lets them go.
test.use({ startPair: null, mirrorsHeld: true });

const JAPANESE_PACKS = ["en", "en-defs", "en-ja"] as const;
/** English → Japanese's size as Settings shows it ("33.2 MB"). */
const JAPANESE_SIZE = `${(
  JAPANESE_PACKS.flatMap((pack) => lock.packs[pack].files).reduce(
    (sum, file) => sum + file.size,
    0,
  ) /
  (1024 * 1024)
).toFixed(1)} MB`;

/** What the service worker finds in both storages. */
async function stored(context: BrowserContext) {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  return worker.evaluate(async () => {
    const { chrome: api } = globalThis as unknown as {
      chrome: {
        storage: {
          local: { get(key: string): Promise<{ packState?: unknown }> };
          sync: { get(key: string): Promise<{ settings?: unknown }> };
        };
      };
    };
    return {
      packs: (await api.storage.local.get("packState")).packState,
      settings: (await api.storage.sync.get("settings")).settings,
    };
  });
}

/** Marks the document that is loaded; a reload makes another one. */
const mark = (page: Page) =>
  page.evaluate(() => {
    (globalThis as { loadedBefore?: boolean }).loadedBefore = true;
  });

const marked = (page: Page) =>
  page
    .evaluate(() => !!(globalThis as { loadedBefore?: boolean }).loadedBefore)
    // Between two documents.
    .catch(() => undefined);

/** The interface after "I speak: Japanese": it follows Your language. */
const ja = uiText("ja");

/** Consent and Start with English → Japanese; the setup is in Japanese from "I speak". */
async function setUp(setup: Page) {
  const ui = uiText(await pageUiLocale(setup));
  await setup.getByRole("button", { name: ui("setup.consent.agree") }).click();
  await setup
    .getByLabel(ui("setup.languages.native"))
    .selectOption({ value: "ja" });
  await setup
    .getByLabel(ja("setup.languages.learning"))
    .selectOption({ value: "en" });
  const closed = setup.waitForEvent("close");
  await setup
    .getByRole("button", { name: ja("setup.languages.start") })
    .click();
  await closed;
}

test.describe("a page that was open before the install", () => {
  test.use({
    // eslint-disable-next-line no-empty-pattern
    beforeInstall: async ({}, use) => {
      await use(async (context) => {
        await context.pages()[0]!.goto("/article-en.html");
      });
    },
  });

  test("nothing happens until consent and Start; then that page is reloaded, the data downloads as the popup and Settings show, and the page is analyzed", async ({
    context,
    extensionId,
  }) => {
    const setup = await setupPage(context);
    const page = context.pages().find((p) => p.url().includes("/article-en"))!;
    await mark(page);
    // Before "I speak", the setup and the popup are in the browser's language.
    const ui = uiText(await pageUiLocale(setup));
    await expect(setup.getByRole("heading")).toHaveText(
      ui("setup.consent.title"),
    );

    const popup = await openPopupFor(context, extensionId, page);
    await expect(popup.getByText(ui("popup.setup.consent"))).toBeVisible();
    expect(
      await sendToBackground(context, extensionId, { type: "getSettings" }),
    ).toMatchObject({ ok: false });

    // Agreeing starts nothing either: the languages are not chosen yet.
    await setup
      .getByRole("button", { name: ui("setup.consent.agree") })
      .click();
    await expect(setup.getByRole("heading")).toHaveText(
      ui("setup.languages.title"),
    );
    await expect(popup.getByText(ui("popup.setup.languages"))).toBeVisible();
    expect(await stored(context)).toEqual({});
    expect(mirrorRequests(context)).toEqual([]);
    expect(await highlighted(page, "langle-new")).toEqual([]);
    expect(await marked(page)).toBe(true);

    await setup
      .getByLabel(ui("setup.languages.native"))
      .selectOption({ value: "ja" });
    // From here on, Japanese: the setup switches with "I speak", and the interface
    // follows Your language.
    await setup
      .getByLabel(ja("setup.languages.learning"))
      .selectOption({ value: "en" });
    const closed = setup.waitForEvent("close");
    await setup
      .getByRole("button", { name: ja("setup.languages.start") })
      .click();
    await closed;

    await expect.poll(() => marked(page)).toBe(false);
    expect((await stored(context)).settings).toMatchObject({
      learningLang: "en",
      nativeLang: "ja",
    });
    await showNewWords(context, extensionId);
    await expect(popup.getByRole("status")).toContainText(
      ja("data.downloading", {
        language: ja("languageName.en"),
        percent: "0",
      }),
    );
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    const row = options.locator("div.sub").filter({
      hasText: ja("language.pair", {
        learning: ja("languageName.en"),
        native: ja("languageName.ja"),
      }),
    });
    await expect(row).toContainText(JAPANESE_SIZE);
    await expect(row).toContainText(
      ja("settings.languages.dataDownloading", { percent: "0" }),
    );
    expect(await highlighted(page, "langle-new")).toEqual([]);
    releasePackMirrors(context);
    await expect(row).toContainText(
      ja("settings.languages.dataDownloaded"),
      COLD_LOAD,
    );
    await expect(popup.getByRole("status")).toHaveCount(0);
    await expect
      .poll(
        async () => (await highlighted(page, "langle-new")).length,
        COLD_LOAD,
      )
      .toBeGreaterThan(0);

    // Each file of the pair's packs once, from the first mirror; nothing else.
    const urls = mirrorRequests(context);
    const files = JAPANESE_PACKS.flatMap((pack) =>
      lock.packs[pack].files.map(
        (file) =>
          `https://cdn.jsdelivr.net/npm/${lock.packs[pack].package}@${lock.packs[pack].version}/${file.path}`,
      ),
    );
    expect([...urls].sort()).toEqual(files.sort());
  });
});

test("the store listing names Langle from _locales, and the setup is in the browser's language", async ({
  context,
}) => {
  const page = await setupPage(context);
  const found = await page.evaluate(() => {
    const { chrome: api } = globalThis as unknown as {
      chrome: {
        i18n: { getMessage(name: string): string; getUILanguage(): string };
        runtime: { getManifest(): Record<string, unknown> };
      };
    };
    const manifest = api.runtime.getManifest();
    return {
      name: api.i18n.getMessage("name"),
      description: api.i18n.getMessage("description"),
      defaultLocale: manifest.default_locale,
      accessible: JSON.stringify(manifest.web_accessible_resources ?? []),
      lang: document.documentElement.lang,
    };
  });
  expect(found.name).toBe("Langle");
  expect(found.description).not.toBe("");
  expect(found.defaultLocale).toBe("en");
  // The locale files go to content scripts through the background, not to pages.
  expect(found.accessible).not.toContain("locales");
  // The setup is in the browser's language where Langle has it, else English.
  expect(found.lang).toBe(await browserUiLocale(page));
});

test("Not now leaves Langle off; the popup opens the setup again, and a page that has Langle is not reloaded", async ({
  context,
  extensionId,
}) => {
  const first = await setupPage(context);
  // Before the setup ends, the setup and the popup are in the browser's language.
  const ui = uiText(await pageUiLocale(first));
  const closed = first.waitForEvent("close");
  await first.getByRole("button", { name: ui("setup.consent.notNow") }).click();
  await closed;

  const page = await context.newPage();
  await page.goto("/article-en.html");
  await mark(page);
  const popup = await openPopupFor(context, extensionId, page);
  const popupClosed = popup.waitForEvent("close");
  await popup.getByRole("button", { name: ui("popup.setup.review") }).click();
  await popupClosed;
  expect(await stored(context)).toEqual({});

  await setUp(await setupPage(context));
  await showNewWords(context, extensionId);
  releasePackMirrors(context);
  await expect
    .poll(async () => (await highlighted(page, "langle-new")).length, COLD_LOAD)
    .toBeGreaterThan(0);
  expect(await marked(page)).toBe(true);
});

test("Settings and the word list lead to the setup until it ends, and the setup to Settings after", async ({
  context,
  extensionId,
}) => {
  const first = await setupPage(context);
  const address = (name: string) => `chrome-extension://${extensionId}/${name}`;
  for (const name of ["options.html", "wordlist.html"]) {
    const page = await context.newPage();
    await page.goto(address(name));
    await page.waitForURL(address("welcome.html"));
    await page.close();
  }
  expect(setupPages(context)).toEqual([first]);
  await setUp(first);
  const again = await context.newPage();
  await again.goto(address("welcome.html"));
  await again.waitForURL(address("options.html"));
});

// Their hooks handled nothing of the load that came before the consent.
for (const [site, route, url] of [
  ["YouTube", routeYouTube, YOUTUBE_WATCH],
  ["Netflix", routeNetflix, NETFLIX_WATCH],
] as const)
  test(`a ${site} page loaded before the consent is reloaded on the return`, async ({
    context,
    extensionId,
  }) => {
    await route(context);
    await (await setupPage(context)).close();
    const page = await context.newPage();
    await page.goto(url);
    await mark(page);
    await expect(page.locator("langle-video-player")).toHaveCount(0);
    const popup = await openPopupFor(context, extensionId, page);
    const ui = uiText(await pageUiLocale(popup));
    await popup.getByRole("button", { name: ui("popup.setup.review") }).click();
    releasePackMirrors(context);
    await setUp(await setupPage(context));
    await expect.poll(() => marked(page)).toBe(false);
    await expect(page.locator("langle-video-player")).toHaveCount(1, COLD_LOAD);
  });
