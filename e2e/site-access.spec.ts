// Articles run only on hosts with a grant (architecture.md "Site access"). The E2E
// builds grant localhost (builds.ts); 127.0.0.1 serves the same pages without one.
// Chrome's prompt, the pending tab and turning a host off are unit-tested
// (src/background/site-access.test.ts): Playwright cannot answer the prompt, and
// Chrome refuses to remove a manifest's host. Neither test may log an error or a warning.
import type { BrowserContext, Page } from "@playwright/test";
import { testWithErrors as test, expect } from "./fixtures";
import { COLD_LOAD, highlighted, openArticle, showNewWords } from "./page";
import { undecidedUrlRegexes } from "../src/core/site-access/undecided-url";

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

/** The service worker's `chrome.declarativeContent`, as far as these tests use it. */
interface PageRules {
  declarativeContent: {
    PageStateMatcher: new (options: object) => object;
    SetIcon: new (options: object) => object;
    onPageChanged: {
      getRules(
        done: (
          rules: { id: string; tags?: string[]; conditions: unknown[] }[],
        ) => void,
      ): void;
      removeRules(ids: string[] | undefined, done: () => void): void;
      addRules(rules: object[], done: () => void): void;
    };
  };
  runtime: { lastError?: { message?: string } };
}

test("the mark's rule is in place once Langle is set up, leaving out the granted host", async ({
  context,
}) => {
  const worker = context.serviceWorkers()[0]!;
  const rules = () =>
    worker.evaluate(
      () =>
        new Promise<{ id: string; tags?: string[]; conditions: unknown[] }[]>(
          (resolve) => {
            const { chrome: api } = globalThis as unknown as {
              chrome: PageRules;
            };
            api.declarativeContent.onPageChanged.getRules(resolve);
          },
        ),
    );
  await expect
    .poll(async () => (await rules()).map((rule) => rule.id))
    .toEqual(["mark"]);
  const [mark] = await rules();
  expect(mark!.tags).toHaveLength(1);
  const conditions = mark!.conditions as {
    pageUrl: { urlMatches: string };
    css: string[];
  }[];
  expect(conditions[0]!.css).toEqual(['html[lang|="en"]']);
  const marked = (url: string) =>
    conditions.some(({ pageUrl }) => new RegExp(pageUrl.urlMatches).test(url));
  expect(marked("http://localhost:4719/article-en.html")).toBe(false);
  expect(marked(UNGRANTED)).toBe(true);
  expect(marked("https://www.youtube.com/watch?v=x")).toBe(false);
});

// Chrome compiles the regexes (RE2) as rules are added: a piece it refuses fails the
// whole call. 2,000 hosts, as many as S0 measured (docs/notes/site-access.md, 3).
test("Chrome accepts the undecided-host regexes for 2,000 hosts", async ({
  context,
}) => {
  const hosts = Array.from(
    { length: 2000 },
    (_, i) =>
      `site-${(i * 7919).toString(36)}.example${i % 3 ? ".com" : ".org"}`,
  );
  const regexes = undecidedUrlRegexes({
    exact: hosts.slice(0, 1900),
    withSubdomains: hosts.slice(1900),
  });
  expect(regexes.length).toBeGreaterThan(1);
  const error = await context.serviceWorkers()[0]!.evaluate(
    (sources) =>
      new Promise<string | undefined>((resolve) => {
        const { chrome: api } = globalThis as unknown as { chrome: PageRules };
        const { declarativeContent: dc } = api;
        dc.onPageChanged.removeRules(undefined, () => {
          dc.onPageChanged.addRules(
            [
              {
                id: "mark",
                conditions: sources.map(
                  (urlMatches) =>
                    new dc.PageStateMatcher({
                      pageUrl: { urlMatches },
                      css: ['html[lang|="en"]'],
                    }),
                ),
                actions: [
                  new dc.SetIcon({ imageData: { 16: new ImageData(16, 16) } }),
                ],
              },
            ],
            () => resolve(api.runtime.lastError?.message),
          );
        });
      }),
    regexes,
  );
  expect(error).toBeUndefined();
});
