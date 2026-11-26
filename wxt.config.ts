import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "wxt";
import preact from "@preact/preset-vite";
import pkg from "./package.json" with { type: "json" };
import {
  RESOURCES_FILE,
  scriptletResources,
} from "./scripts/adblock-resources.ts";
import { bundledLicenses } from "./scripts/licenses.ts";
import { localeFiles, localesPlugin } from "./scripts/locales.ts";
import { noticesPlugin } from "./scripts/notices.ts";
import { DEVELOPMENT_EXTENSION_KEY } from "./src/background/sync/google-clients.ts";
import { LICENSES_FILE } from "./src/core/notices.ts";

/** The store listing's English summary, as public/_locales/en/messages.json has it. */
const STORE_DESCRIPTION = (
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, "public/_locales/en/messages.json"),
      "utf8",
    ),
  ) as { description: { message: string } }
).description.message;

// The packages each build ships, found in its output, for THIRD_PARTY_LICENSES.txt.
const licenses = bundledLicenses(import.meta.dirname);

export default defineConfig({
  srcDir: "src",
  manifestVersion: 3,
  // The data sources and licenses page's data (`virtual:langle-notices`), and the
  // bundled packages' licenses. The phone app also lists its translation models and
  // its ad blocking's filter lists and engine.
  vite: ({ browser }) => ({
    plugins: [
      preact(),
      noticesPlugin({ app: browser === "langle-app" }),
      // The codes of the interface's locales; the locales themselves are files.
      localesPlugin(),
      licenses.plugin(),
    ],
  }),
  manifest: ({ mode, browser }) => {
    return {
      // The store listing in the browser's language (public/_locales/<locale>/
      // messages.json). The phone app reads the manifest itself and knows no
      // default_locale (docs/specs/mobile-app.md "The langle-app build target").
      ...(browser === "langle-app"
        ? { name: "Langle", description: STORE_DESCRIPTION }
        : {
            name: "__MSG_name__",
            description: "__MSG_description__",
            default_locale: "en",
          }),
      version: pkg.version,
      // alarms: retries of language data downloads (src/background/pack-downloads.ts);
      // it shows no warning at install in Chrome. identity: signing in to the user's
      // own cloud storage (src/background/sync/google-auth.ts); no warning either.
      permissions: ["storage", "alarms", "identity"],
      // Development and check builds keep one id, so the sign-in redirect
      // (https://<id>.chromiumapp.org/) Google's Web client lists stays theirs
      // (src/background/sync/google-clients.ts). Builds target Chromium only: Firefox
      // is paused (docs/notes/firefox-paused.md).
      ...(mode !== "production" && { key: DEVELOPMENT_EXTENSION_KEY }),
    };
  },
  hooks: {
    // The language packs are not part of the build: the extension downloads them from
    // the mirrors in src/core/packs/packs.lock.json (src/core/packs/lock.ts).
    "build:before": (wxt) => {
      if (wxt.config.mode === "production" && process.env.WXT_PACK_MIRRORS)
        wxt.logger.warn("WXT_PACK_MIRRORS is ignored in production builds");
      licenses.reset();
    },
    // Runs once every entrypoint is built: the licenses of all the packages they ship.
    // The phone app's also lists the translation engine its APK ships.
    // The phone app also gets its ad-blocking scriptlets as the engine's resources.
    "build:publicAssets": async (wxt, files) => {
      // The interface's locales other than English, loaded when chosen.
      files.push(...localeFiles());
      files.push({
        relativeDest: LICENSES_FILE,
        contents: licenses.file({ app: wxt.config.browser === "langle-app" }),
      });
      if (wxt.config.browser === "langle-app")
        files.push(
          {
            relativeDest: RESOURCES_FILE,
            contents: await scriptletResources(),
          },
          // The lists the app fetches (mobile/protocol/filter-lists.json, shared with iOS).
          {
            relativeDest: "adblock/filter-lists.json",
            absoluteSrc: join(
              wxt.config.root,
              "mobile/protocol/filter-lists.json",
            ),
          },
        );
    },
  },
});
