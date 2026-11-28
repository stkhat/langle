// Articles run only on hosts with a grant (architecture.md "Site access"). The E2E
// builds grant localhost (builds.ts); 127.0.0.1 serves the same pages without one.
// Chrome's prompt, the pending tab and turning a host off are unit-tested
// (src/background/site-access.test.ts): Playwright cannot answer the prompt, and
// Chrome refuses to remove a manifest's host. Neither test may log an error or a warning.
import type { BrowserContext, Page } from "@playwright/test";
import { testWithErrors as test, expect } from "./fixtures";
import { COLD_LOAD, highlighted, openArticle, showNewWords } from "./page";

const UNGRANTED = "http://127.0.0.1:4719/article-en.html";

/** Injects the article script into the tab with `url`, as the background does. */
async function inject(context: BrowserContext, url: string) {
  await context.serviceWorkers()[0]!.evaluate(async (href) => {
    const { chrome: api } = globalThis as unknown as {
      chrome: {
        tabs: { query(q: { url: string }): Promise<{ id: number }[]> };
        scripting: {
          executeScript(i: {
            target: { tabId: number };
            files: string[];
          }): Promise<unknown>;
        };
      };
    };
    const [tab] = await api.tabs.query({ url: href });
    await api.scripting.executeScript({
      target: { tabId: tab!.id },
      files: ["content-scripts/content.js"],
    });
  }, url);
}

const newWords = async (page: Page) =>
  (await highlighted(page, "langle-new")).length;

test("a page on a host without a grant gets nothing; one with a grant gets highlights", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  const ungranted = await context.newPage();
  await ungranted.goto(UNGRANTED);
  await ungranted.waitForLoadState("load");
  // The granted host's page is highlighted meanwhile.
  await openArticle(context);
  await expect(ungranted.locator("langle-article")).toHaveCount(0);
  expect(await newWords(ungranted)).toBe(0);
});

test("the article script injected into a page starts there, and a second copy leaves one", async ({
  context,
  extensionId,
}) => {
  await showNewWords(context, extensionId);
  // As before the host was turned on: no registration, a page loaded without Langle.
  await context.serviceWorkers()[0]!.evaluate(async () => {
    const { chrome: api } = globalThis as unknown as {
      chrome: {
        scripting: {
          unregisterContentScripts(f: { ids: string[] }): Promise<void>;
        };
      };
    };
    await api.scripting.unregisterContentScripts({ ids: ["articles"] });
  });
  const page = await context.newPage();
  await page.goto("/article-en.html");
  await page.waitForLoadState("load");
  await expect(page.locator("langle-article")).toHaveCount(0);

  // Injected, as when the grant arrives: highlights without a reload.
  await inject(context, page.url());
  await expect.poll(() => newWords(page), COLD_LOAD).toBeGreaterThan(0);
  await expect(page.locator("langle-article")).toHaveCount(1);

  // Once more (a registered copy on top of an injected one): still one.
  await inject(context, page.url());
  await expect.poll(() => newWords(page), COLD_LOAD).toBeGreaterThan(0);
  await expect(page.locator("langle-article")).toHaveCount(1);
});
