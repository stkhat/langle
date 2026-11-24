import { defineConfig } from "wxt";
import preact from "@preact/preset-vite";
import pkg from "./package.json" with { type: "json" };
import { bundledLicenses } from "./scripts/licenses.ts";
import { noticesPlugin } from "./scripts/notices.ts";
import { DEVELOPMENT_EXTENSION_KEY } from "./src/background/sync/google-clients.ts";
import { LICENSES_FILE } from "./src/core/notices.ts";

// The packages each build ships, found in its output, for THIRD_PARTY_LICENSES.txt.
const licenses = bundledLicenses(import.meta.dirname);

export default defineConfig({
  srcDir: "src",
  manifestVersion: 3,
  // The data sources and licenses page's data (`virtual:langle-notices`), and the
  // bundled packages' licenses.
  vite: () => ({
    plugins: [preact(), noticesPlugin(), licenses.plugin()],
  }),
  manifest: ({ mode }) => {
    return {
      name: "Langle",
      version: pkg.version,
      description:
        "Learn languages on the videos and articles you already read.",
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
    "build:publicAssets": (_wxt, files) => {
      files.push({ relativeDest: LICENSES_FILE, contents: licenses.file() });
    },
  },
});
