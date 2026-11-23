import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  collectExtensionErrors,
  connectBrowserCdp,
  freePort,
  type BrowserCdp,
  type ErrorCollector,
} from "./error-collector";
import {
  mergeSettings,
  SETTINGS_KEY,
  SETTINGS_TIMES_KEY,
} from "../src/core/settings";
import { CONSENT_VERSION, SETUP_KEY } from "../src/core/setup";
import {
  BLOCK_MIRROR_HOSTS,
  routePackMirrors,
  type MirrorRouting,
} from "./pack-mirrors";

/**
 * Which build to load: `npm run build` (production), `wxt build --mode check` (the
 * build loaded in your own Chrome, with WXT's dev logging and the self-reload), or
 * `npm run build:check-download` (the check build without the self-reload, whose
 * language data comes from the local mirror in serve.ts; see .env.check-download). The
 * other builds download from the lock's mirrors, which pack-mirrors.ts answers.
 * Production closes the shadow roots of Langle's UI on web pages, so Playwright cannot
 * reach into it there: tests that drive the UI use a check build.
 */
export type Build = "production" | "check" | "download";

const BUILDS: Record<Build, { dir: string; command: string }> = {
  production: { dir: "chrome-mv3", command: "npm run build" },
  check: { dir: "chrome-mv3-check", command: "wxt build --mode check" },
  download: {
    dir: "chrome-mv3-check-download",
    command: "npm run build:check-download",
  },
};

export const extensionPathOf = (build: Build) =>
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.output",
    BUILDS[build].dir,
  );

/**
 * A fresh browser profile with a built extension loaded. The lock's mirrors are routed
 * to data/packs/ first (pack-mirrors.ts), then the extension is loaded through CDP
 * (after `before`, if given): once installed, it opens its setup and nothing else.
 */
async function launchWithExtension(
  build: Build,
  port: number,
  mirrors: MirrorRouting,
  before: ((context: BrowserContext) => Promise<void>) | null,
): Promise<BrowserContext> {
  const extensionPath = extensionPathOf(build);
  if (!fs.existsSync(path.join(extensionPath, "manifest.json")))
    throw new Error(`Build first: ${BUILDS[build].command}`);
  const headed = !!process.env.PWDEBUG || !!process.env.HEADED;
  const context = await chromium.launchPersistentContext("", {
    // Bundled Chromium: stable Chrome 137+ cannot load an unpacked extension this way.
    channel: "chromium",
    headless: !headed,
    // Playwright turns extensions off; --disable-extensions-except would load this one
    // at launch, before the routes.
    ignoreDefaultArgs: ["--disable-extensions"],
    // A Japanese UI, which the setup fills in: Linux reads the UI language from
    // LANGUAGE (it ignores --lang), Windows from --lang; macOS from the system's
    // languages.
    env: { ...process.env, LANGUAGE: "ja" },
    args: [
      // For the error collector's CDP connection.
      `--remote-debugging-port=${port}`,
      // For CDP's Extensions.loadUnpacked, which loads and reloads the extension.
      "--enable-unsafe-extension-debugging",
      "--lang=ja",
      BLOCK_MIRROR_HOSTS,
    ],
  });
  await routePackMirrors(context, mirrors);
  await before?.(context);
  const cdp = await connectBrowserCdp(port);
  try {
    const reply = await cdp.send("Extensions.loadUnpacked", {
      path: extensionPath,
    });
    if (reply.error)
      throw new Error(`Could not load the extension: ${reply.error.message}`);
  } finally {
    cdp.close();
  }
  return context;
}

async function extensionIdOf(context: BrowserContext): Promise<string> {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  return new URL(worker.url()).host;
}

/** The setup's pages that are open. */
export const setupPages = (context: BrowserContext) =>
  context.pages().filter((page) => page.url().endsWith("/welcome.html"));

/** The setup a new install opens. */
export async function setupPage(context: BrowserContext): Promise<Page> {
  await base.expect.poll(() => setupPages(context).length).toBe(1);
  const page = setupPages(context)[0]!;
  await page.waitForLoadState();
  return page;
}

/**
 * Sets the new install up with `pair`, as consent and Start would leave it, and closes
 * the setup it opened: without the return to a tab and the popup, which first-run.spec.ts
 * tests.
 */
async function useStartPair(
  context: BrowserContext,
  [learningLang, nativeLang]: readonly [string, string],
) {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  await (await setupPage(context)).close();
  // What Start stores (`storeChosenPair`, then the setup): all settings with their
  // times, so browser sync's space is as full as it is after a real setup.
  const values = mergeSettings({ learningLang, nativeLang });
  await worker.evaluate(
    async ([sync, local]) => {
      const { chrome: api } = globalThis as unknown as {
        chrome: {
          storage: {
            local: { set(items: object): Promise<void> };
            sync: { set(items: object): Promise<void> };
          };
        };
      };
      await api.storage.sync.set(sync);
      await api.storage.local.set(local);
    },
    [
      { [SETTINGS_KEY]: values, [SETTINGS_TIMES_KEY]: { values, times: {} } },
      { [SETUP_KEY]: { consent: CONSENT_VERSION, languages: true } },
    ] as const,
  );
}

export const test = base.extend<{
  build: Build;
  /**
   * The pair each test starts set up with (default: English → Japanese, the
   * development pair); null leaves the new install at its setup.
   */
  startPair: readonly [string, string] | null;
  /** Runs in the browser before Langle is installed in it. */
  beforeInstall: ((context: BrowserContext) => Promise<void>) | null;
  /**
   * The lock's mirrors wait until `releasePackMirrors` (pack-mirrors.ts): all of them,
   * or those of these packs' files.
   */
  mirrorsHeld: boolean | readonly string[];
  /** The lock's mirrors' bandwidth in bits per second (pack-mirrors.ts); 0: none. */
  mirrorBitsPerSecond: number;
  port: number;
  context: BrowserContext;
  extensionId: string;
}>({
  build: ["check", { option: true }],
  startPair: [["en", "ja"], { option: true }],
  beforeInstall: [null, { option: true }],
  mirrorsHeld: [false, { option: true }],
  mirrorBitsPerSecond: [0, { option: true }],
  // eslint-disable-next-line no-empty-pattern
  port: async ({}, use) => {
    await use(await freePort());
  },
  context: async (
    { build, startPair, beforeInstall, mirrorsHeld, mirrorBitsPerSecond, port },
    use,
  ) => {
    const context = await launchWithExtension(
      build,
      port,
      { held: mirrorsHeld, bitsPerSecond: mirrorBitsPerSecond },
      beforeInstall,
    );
    if (startPair) await useStartPair(context, startPair);
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    await use(await extensionIdOf(context));
  },
});

export const expect = test.expect;

/**
 * Fails each test with what Chrome's chrome://extensions → Errors page would show: the
 * extension logged an error or a warning, or threw (error-collector.ts).
 */
export const testWithErrors = test.extend<{
  cdp: BrowserCdp;
  errors: ErrorCollector;
}>({
  cdp: async ({ context, port }, use) => {
    void context;
    const cdp = await connectBrowserCdp(port);
    await use(cdp);
    cdp.close();
  },
  errors: [
    async ({ context, extensionId, cdp }, use) => {
      const errors = await collectExtensionErrors(context, extensionId, cdp);
      await use(errors);
      // A last round trip: whatever the background was doing has been reported.
      await sendToBackground(context, extensionId, { type: "getSettings" });
      errors.stop();
      expect(errors.format(), "Langle's reports on the Errors page").toBe("");
    },
    { auto: true },
  ],
});

const senders = new WeakMap<BrowserContext, Promise<Page>>();

/** An extension page kept open for `sendToBackground` (a new one after a reload). */
function senderPage(context: BrowserContext, extensionId: string) {
  let page = senders.get(context);
  if (!page) {
    page = context.newPage().then(async (p) => {
      await p.goto(`chrome-extension://${extensionId}/popup.html`);
      return p;
    });
    senders.set(context, page);
  }
  return page;
}

/**
 * Sends a request to the background from an extension page, as the popup and the
 * options page do, and returns the reply (`{ ok, value }` or `{ ok, error }`).
 */
export async function sendToBackground(
  context: BrowserContext,
  extensionId: string,
  request: { type: string } & Record<string, unknown>,
): Promise<unknown> {
  let page = await senderPage(context, extensionId);
  // Reloading the extension closes its pages.
  if (page.isClosed()) {
    senders.delete(context);
    page = await senderPage(context, extensionId);
  }
  return page.evaluate((message) => {
    // The extension page's own `chrome.runtime`; the test drives Chromium directly.
    const { chrome: api } = globalThis as unknown as {
      chrome: { runtime: { sendMessage(m: unknown): Promise<unknown> } };
    };
    return api.runtime.sendMessage(message);
  }, request);
}

/**
 * Opens the toolbar popup's page for `page`, as clicking the toolbar icon would: the
 * popup asks the active tab, so `page` is brought to the front first and the popup
 * loads in a tab behind it.
 */
export async function openPopupFor(
  context: BrowserContext,
  extensionId: string,
  page: Page,
): Promise<Page> {
  const popup = await context.newPage();
  await page.bringToFront();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  return popup;
}
